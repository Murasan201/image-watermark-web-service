import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { createDecipheriv } from 'crypto';

// 暗号化キー（環境変数から取得）
const ENCRYPT_KEY_HEX = process.env.ENCRYPT_KEY || 'default-32-char-key-change-prod!!';
const ENCRYPT_KEY = Buffer.from(ENCRYPT_KEY_HEX, 'hex');

// Webhook URL復号化
function decryptWebhookUrl(encrypted: string, iv: string): string {
  const decipher = createDecipheriv('aes-256-cbc', ENCRYPT_KEY, Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Webhook URL取得関数（内部使用のみ）
async function getDecryptedWebhookUrl(): Promise<string | null> {
  try {
    const db = await getDb();
    const result = await db.query(
      'SELECT setting_value_encrypted FROM admin_settings WHERE setting_key = $1',
      ['slack_webhook']
    );

    if (result.rows.length === 0) {
      return null;
    }

    const setting = result.rows[0];
    const encryptedData = JSON.parse(setting.setting_value_encrypted);
    return decryptWebhookUrl(encryptedData.encrypted, encryptedData.iv);
    
  } catch (error) {
    console.error('Get decrypted webhook URL error:', error);
    return null;
  }
}

// 招待コード生成
export async function POST(request: NextRequest) {
  try {
    const { year, month } = await request.json();

    // 入力値検証
    if (!year || !month) {
      return NextResponse.json(
        { success: false, message: '年月を指定してください' },
        { status: 400 }
      );
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (yearNum < 2025 || yearNum > 2030 || monthNum < 1 || monthNum > 12) {
      return NextResponse.json(
        { success: false, message: '有効な年月を指定してください' },
        { status: 400 }
      );
    }

    // 招待コード生成（YYYYMM-XXXXX形式）
    const yearMonth = `${yearNum}${monthNum.toString().padStart(2, '0')}`;
    const randomPart = generateRandomCode(5);
    const invitationCode = `${yearMonth}-${randomPart}`;

    // month値を生成（YYYY-MM形式）
    const monthValue = `${yearNum}-${monthNum.toString().padStart(2, '0')}`;

    // 有効期限（当月末）
    const expiresAt = new Date(yearNum, monthNum, 0, 23, 59, 59); // 当月末の23:59:59

    const db = await getDb();

    // 既存のコードをチェック
    const existingCode = await db.query(
      'SELECT code FROM invitation_codes WHERE code = $1',
      [invitationCode]
    );

    if (existingCode.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: '同じコードが既に存在します。再度生成してください。' },
        { status: 400 }
      );
    }

    // データベースに保存
    await db.query(
      `INSERT INTO invitation_codes (code, month, expires_at, created_at, is_active) 
       VALUES ($1, $2, $3, NOW(), true)`,
      [invitationCode, monthValue, expiresAt]
    );

    // Slack通知送信（エラーがあっても処理は継続）
    try {
      await sendSlackNotification(invitationCode, expiresAt);
    } catch (slackError) {
      console.error('Slack notification failed:', slackError);
      // Slack通知失敗はログのみ出力し、処理は継続
    }

    return NextResponse.json({
      success: true,
      code: invitationCode,
      expiresAt: expiresAt.toISOString(),
      message: '招待コードを生成しました'
    });

  } catch (error) {
    console.error('Invitation code generation error:', error);
    return NextResponse.json(
      { success: false, message: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// 招待コード一覧取得
export async function GET() {
  try {
    const db = await getDb();

    const result = await db.query(`
      SELECT 
        ic.code,
        ic.expires_at,
        ic.created_at,
        ic.is_active,
        ic.usage_count,
        COUNT(us.session_id) as active_sessions
      FROM invitation_codes ic
      LEFT JOIN user_sessions us ON ic.code = us.code_used
      GROUP BY ic.code, ic.expires_at, ic.created_at, ic.is_active, ic.usage_count
      ORDER BY ic.created_at DESC
      LIMIT 50
    `);

    const codes = result.rows.map((row: any) => ({
      code: row.code,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      isActive: row.is_active,
      usedCount: parseInt(row.usage_count) || 0,
      activeSessions: parseInt(row.active_sessions) || 0
    }));

    return NextResponse.json({
      success: true,
      codes
    });

  } catch (error) {
    console.error('Get invitation codes error:', error);
    return NextResponse.json(
      { success: false, message: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// 招待コード無効化
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { success: false, message: 'コードが指定されていません' },
        { status: 400 }
      );
    }

    const db = await getDb();

    const result = await db.query(
      'UPDATE invitation_codes SET is_active = false WHERE code = $1',
      [code]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, message: '指定されたコードが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '招待コードを無効化しました'
    });

  } catch (error) {
    console.error('Deactivate invitation code error:', error);
    return NextResponse.json(
      { success: false, message: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// Slack通知送信関数
async function sendSlackNotification(invitationCode: string, expiresAt: Date): Promise<void> {
  const webhookUrl = await getDecryptedWebhookUrl();
  
  if (!webhookUrl) {
    console.log('Slack webhook not configured, skipping notification');
    return;
  }

  const message = {
    text: '🎫 新しい招待コードが生成されました',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎫 新しい招待コードが生成されました'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*招待コード:*\n\`${invitationCode}\``
          },
          {
            type: 'mrkdwn',
            text: `*有効期限:*\n${expiresAt.toLocaleString('ja-JP')}`
          },
          {
            type: 'mrkdwn',
            text: `*使用回数:*\n0回`
          },
          {
            type: 'mrkdwn',
            text: `*ステータス:*\n✅ 有効`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '📊 *管理画面でコードの使用状況を確認できます*'
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '管理画面を開く'
          },
          url: `${process.env.NEXTAUTH_URL || 'https://image-watermark-web-service.vercel.app'}/admin`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `生成日時: ${new Date().toLocaleString('ja-JP')} | 画像ウォーターマークサービス`
          }
        ]
      }
    ]
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Slack notification failed: ${response.status} ${response.statusText}`);
  }
}

// ランダムコード生成関数
function generateRandomCode(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}