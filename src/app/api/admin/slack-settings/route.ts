import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// 暗号化キー（環境変数から取得）
const ENCRYPT_KEY_HEX = process.env.ENCRYPT_KEY || 'default-32-char-key-change-prod!!';
const ENCRYPT_KEY = Buffer.from(ENCRYPT_KEY_HEX, 'hex');

// Webhook URL暗号化
function encryptWebhookUrl(url: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', ENCRYPT_KEY, iv);
  let encrypted = cipher.update(url, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encrypted, iv: iv.toString('hex') };
}

// Webhook URL復号化
function decryptWebhookUrl(encrypted: string, iv: string): string {
  const decipher = createDecipheriv('aes-256-cbc', ENCRYPT_KEY, Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Slack Webhook URL検証
function validateSlackWebhookUrl(url: string): boolean {
  const slackWebhookPattern = /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+$/;
  return slackWebhookPattern.test(url);
}

// Slack設定保存
export async function POST(request: NextRequest) {
  try {
    const { webhookUrl, testMode = false } = await request.json();

    // 入力値検証
    if (!webhookUrl) {
      return NextResponse.json(
        { success: false, message: 'Webhook URLを入力してください' },
        { status: 400 }
      );
    }

    // Slack Webhook URL形式チェック
    if (!validateSlackWebhookUrl(webhookUrl)) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Slack Webhook URLの形式が正しくありません。正しい形式: https://hooks.slack.com/services/...' 
        },
        { status: 400 }
      );
    }

    // テストモードの場合はテスト通知のみ送信
    if (testMode) {
      try {
        const testResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: '🧪 Slack通知テスト',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*画像ウォーターマークサービス 管理画面*\n\nSlack通知のテストメッセージです。\n設定が正常に完了しました！'
                }
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `テスト実行日時: ${new Date().toLocaleString('ja-JP')}`
                  }
                ]
              }
            ]
          }),
        });

        if (!testResponse.ok) {
          return NextResponse.json(
            { success: false, message: 'Slack通知のテスト送信に失敗しました' },
            { status: 400 }
          );
        }

        return NextResponse.json({
          success: true,
          message: 'Slack通知のテストが成功しました！設定を保存する場合は再度保存してください。'
        });

      } catch (error: any) {
        return NextResponse.json(
          { success: false, message: 'Slack通知のテスト送信でエラーが発生しました' },
          { status: 400 }
        );
      }
    }

    // Webhook URL暗号化
    const { encrypted, iv } = encryptWebhookUrl(webhookUrl);
    
    // 暗号化データをJSONで保存
    const encryptedData = JSON.stringify({ encrypted, iv });

    const db = await getDb();

    // 既存設定を削除して新しい設定を挿入
    await db.query('DELETE FROM admin_settings WHERE setting_key = $1', ['slack_webhook']);
    
    await db.query(
      `INSERT INTO admin_settings (setting_key, setting_value_encrypted, updated_at) 
       VALUES ($1, $2, NOW())`,
      ['slack_webhook', encryptedData]
    );

    return NextResponse.json({
      success: true,
      message: 'Slack通知設定を保存しました'
    });

  } catch (error: any) {
    console.error('Slack settings save error:', error);
    return NextResponse.json(
      { success: false, message: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// Slack設定取得
export async function GET() {
  try {
    const db = await getDb();

    const result = await db.query(
      'SELECT setting_value_encrypted, updated_at FROM admin_settings WHERE setting_key = $1',
      ['slack_webhook']
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        configured: false,
        message: 'Slack通知が設定されていません'
      });
    }

    const setting = result.rows[0];

    try {
      // 暗号化データを解析
      const encryptedData = JSON.parse(setting.setting_value_encrypted);
      
      // 復号化してURL形式チェック（セキュリティのため実際のURLは返さない）
      const webhookUrl = decryptWebhookUrl(encryptedData.encrypted, encryptedData.iv);
      const isValid = validateSlackWebhookUrl(webhookUrl);

      return NextResponse.json({
        success: true,
        configured: true,
        isValid,
        updatedAt: setting.updated_at,
        maskedUrl: webhookUrl.replace(/\/services\/.*/, '/services/***')
      });

    } catch (error: any) {
      return NextResponse.json({
        success: true,
        configured: true,
        isValid: false,
        message: '設定されたWebhook URLが復号化できません'
      });
    }

  } catch (error: any) {
    console.error('Get Slack settings error:', error);
    return NextResponse.json(
      { success: false, message: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// Slack設定削除
export async function DELETE() {
  try {
    const db = await getDb();

    await db.query('DELETE FROM admin_settings WHERE setting_key = $1', ['slack_webhook']);

    return NextResponse.json({
      success: true,
      message: 'Slack通知設定を削除しました'
    });

  } catch (error: any) {
    console.error('Delete Slack settings error:', error);
    return NextResponse.json(
      { success: false, message: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// 内部利用のみの復号化関数（エクスポートしない）
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
    
  } catch (error: any) {
    console.error('Get decrypted webhook URL error:', error);
    return null;
  }
}