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
    const { year, month, codeType, userName, userDescription, expirationDays } = await request.json();

    // データベースマイグレーション状況をチェック
    const db = await getDb();
    const columnCheckResult = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'invitation_codes' 
      AND column_name IN ('code_type', 'user_name', 'user_description')
    `);

    const hasNewColumns = columnCheckResult.rows.length > 0;

    // マイグレーション前は月次コードのみ対応
    if (!hasNewColumns && codeType === 'user_specific') {
      return NextResponse.json(
        { success: false, message: 'データベースマイグレーションが必要です。個別ユーザーキー機能は現在利用できません。' },
        { status: 503 }
      );
    }

    // コードタイプ別の処理
    if (codeType === 'user_specific' && hasNewColumns) {
      // 個別ユーザーキー生成
      return await generateUserSpecificKey(userName, userDescription, expirationDays);
    } else {
      // 月次コード生成（従来の処理）
      return await generateMonthlyCode(year, month, hasNewColumns);
    }

  } catch (error) {
    console.error('Invitation code generation error:', error);
    return NextResponse.json(
      { success: false, message: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// 月次コード生成関数
async function generateMonthlyCode(year: string, month: string, hasNewColumns: boolean = false) {
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

  // データベースに保存（マイグレーション前後の対応）
  if (hasNewColumns) {
    await db.query(
      `INSERT INTO invitation_codes (code, code_type, month, expires_at, is_active) 
       VALUES ($1, $2, $3, $4, true)`,
      [invitationCode, 'monthly', monthValue, expiresAt]
    );
  } else {
    await db.query(
      `INSERT INTO invitation_codes (code, month, expires_at, is_active) 
       VALUES ($1, $2, $3, true)`,
      [invitationCode, monthValue, expiresAt]
    );
  }

  // Slack通知送信（エラーがあっても処理は継続）
  try {
    await sendSlackNotification(invitationCode, expiresAt, 'monthly');
  } catch (slackError) {
    console.error('Slack notification failed:', slackError);
    // Slack通知失敗はログのみ出力し、処理は継続
  }

  return NextResponse.json({
    success: true,
    code: invitationCode,
    expiresAt: expiresAt.toISOString(),
    message: '月次招待コードを生成しました'
  });
}

// 個別ユーザーキー生成関数
async function generateUserSpecificKey(userName: string, userDescription: string, expirationDays: number) {
  // 入力値検証
  if (!userName || !userName.trim()) {
    return NextResponse.json(
      { success: false, message: 'ユーザー名を入力してください' },
      { status: 400 }
    );
  }

  if (!expirationDays || expirationDays < 1 || expirationDays > 3650) {
    return NextResponse.json(
      { success: false, message: '有効期限は1日〜3650日で指定してください' },
      { status: 400 }
    );
  }

  // 個別ユーザーキー生成（USER-XXXXX形式）
  const randomPart = generateRandomCode(5);
  const invitationCode = `USER-${randomPart}`;

  // 有効期限（指定日数後）
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);
  expiresAt.setHours(23, 59, 59, 999); // 当日の23:59:59

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
    `INSERT INTO invitation_codes (code, code_type, user_name, user_description, expires_at, is_active) 
     VALUES ($1, $2, $3, $4, $5, true)`,
    [invitationCode, 'user_specific', userName.trim(), userDescription?.trim() || null, expiresAt]
  );

  // Slack通知送信（エラーがあっても処理は継続）
  try {
    await sendSlackNotification(invitationCode, expiresAt, 'user_specific', userName, userDescription);
  } catch (slackError) {
    console.error('Slack notification failed:', slackError);
    // Slack通知失敗はログのみ出力し、処理は継続
  }

  return NextResponse.json({
    success: true,
    code: invitationCode,
    expiresAt: expiresAt.toISOString(),
    message: `個別ユーザーキーを生成しました（${userName}様用）`
  });
}

// 招待コード一覧取得
export async function GET() {
  try {
    const db = await getDb();

    // 新しいカラムが存在するかチェック
    const columnCheckResult = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'invitation_codes' 
      AND column_name IN ('code_type', 'user_name', 'user_description')
    `);

    const hasNewColumns = columnCheckResult.rows.length > 0;

    let result;
    if (hasNewColumns) {
      // 新しいスキーマ（マイグレーション後）
      result = await db.query(`
        SELECT 
          ic.code,
          ic.code_type,
          ic.month,
          ic.user_name,
          ic.user_description,
          ic.expires_at,
          ic.created_at,
          ic.is_active,
          ic.usage_count,
          COUNT(us.session_id) as active_sessions
        FROM invitation_codes ic
        LEFT JOIN user_sessions us ON ic.code = us.code_used
        GROUP BY ic.code, ic.code_type, ic.month, ic.user_name, ic.user_description, 
                 ic.expires_at, ic.created_at, ic.is_active, ic.usage_count
        ORDER BY ic.created_at DESC
        LIMIT 50
      `);
    } else {
      // 古いスキーマ（マイグレーション前）
      result = await db.query(`
        SELECT 
          ic.code,
          ic.month,
          ic.expires_at,
          ic.created_at,
          ic.is_active,
          ic.usage_count,
          COUNT(us.session_id) as active_sessions
        FROM invitation_codes ic
        LEFT JOIN user_sessions us ON ic.code = us.code_used
        GROUP BY ic.code, ic.month, ic.expires_at, ic.created_at, ic.is_active, ic.usage_count
        ORDER BY ic.created_at DESC
        LIMIT 50
      `);
    }

    const codes = result.rows.map((row: any) => ({
      code: row.code,
      codeType: row.code_type || 'monthly',
      month: row.month,
      userName: row.user_name,
      userDescription: row.user_description,
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

    console.log('DELETE request - code:', code);

    if (!code) {
      return NextResponse.json(
        { success: false, message: 'コードが指定されていません' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // コードの存在確認
    const existingCode = await db.query(
      'SELECT code, is_active FROM invitation_codes WHERE code = $1',
      [code]
    );

    console.log('Existing code check:', existingCode.rows);

    if (existingCode.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '指定されたコードが見つかりません' },
        { status: 404 }
      );
    }

    const result = await db.query(
      'UPDATE invitation_codes SET is_active = false WHERE code = $1',
      [code]
    );

    console.log('Update result:', result.rowCount);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, message: 'コードの無効化に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '招待コードを無効化しました'
    });

  } catch (error) {
    console.error('Deactivate invitation code error:', error);
    return NextResponse.json(
      { success: false, message: `サーバーエラーが発生しました: ${error.message}` },
      { status: 500 }
    );
  }
}

// Slack通知送信関数
async function sendSlackNotification(
  invitationCode: string, 
  expiresAt: Date, 
  codeType: string = 'monthly',
  userName?: string, 
  userDescription?: string
): Promise<void> {
  const webhookUrl = await getDecryptedWebhookUrl();
  
  if (!webhookUrl) {
    console.log('Slack webhook not configured, skipping notification');
    return;
  }

  const isUserSpecific = codeType === 'user_specific';
  const headerText = isUserSpecific ? '👤 新しい個別ユーザーキーが生成されました' : '🎫 新しい月次招待コードが生成されました';
  
  const fields = [
    {
      type: 'mrkdwn',
      text: `*${isUserSpecific ? '個別キー' : '招待コード'}:*\n\`${invitationCode}\``
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
  ];

  // 個別ユーザーキーの場合、ユーザー情報を追加
  if (isUserSpecific && userName) {
    fields.push({
      type: 'mrkdwn',
      text: `*対象ユーザー:*\n${userName}`
    });
  }

  if (isUserSpecific && userDescription) {
    fields.push({
      type: 'mrkdwn',
      text: `*用途:*\n${userDescription}`
    });
  }

  const message = {
    text: headerText,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: headerText
        }
      },
      {
        type: 'section',
        fields: fields
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