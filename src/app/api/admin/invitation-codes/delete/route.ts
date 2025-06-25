import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';

// 招待コード削除（完全削除）
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

    // コードの存在確認と期限チェック
    const existingCode = await db.query(
      'SELECT code, expires_at, is_active FROM invitation_codes WHERE code = $1',
      [code]
    );

    console.log('Existing code check:', existingCode.rows);

    if (existingCode.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '指定されたコードが見つかりません' },
        { status: 404 }
      );
    }

    const codeData = existingCode.rows[0];
    const now = new Date();
    const expiresAt = new Date(codeData.expires_at);

    // 期限切れかつ無効化されているもののみ削除可能
    if (expiresAt > now && codeData.is_active) {
      return NextResponse.json(
        { success: false, message: '有効期限内のアクティブなコードは削除できません。まず無効化してください。' },
        { status: 400 }
      );
    }

    // 関連セッションも削除
    await db.query(
      'DELETE FROM user_sessions WHERE code_used = $1',
      [code]
    );

    // 招待コードを削除
    const result = await db.query(
      'DELETE FROM invitation_codes WHERE code = $1',
      [code]
    );

    console.log('Delete result:', result.rowCount);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, message: 'コードの削除に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '招待コードを完全に削除しました'
    });

  } catch (error: any) {
    console.error('Delete invitation code error:', error);
    return NextResponse.json(
      { success: false, message: `サーバーエラーが発生しました: ${error.message}` },
      { status: 500 }
    );
  }
}

// 期限切れコード一括削除
export async function POST(request: NextRequest) {
  try {
    const { deleteExpired } = await request.json();

    if (!deleteExpired) {
      return NextResponse.json(
        { success: false, message: '削除フラグが指定されていません' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // 期限切れかつ無効化されているコードを取得
    const expiredCodes = await db.query(`
      SELECT code FROM invitation_codes 
      WHERE expires_at < NOW() AND is_active = false
    `);

    if (expiredCodes.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: '削除対象の期限切れコードはありません',
        deletedCount: 0
      });
    }

    const codesToDelete = expiredCodes.rows.map(row => row.code);

    // 関連セッションを削除
    await db.query(
      'DELETE FROM user_sessions WHERE code_used = ANY($1)',
      [codesToDelete]
    );

    // 招待コードを一括削除
    const result = await db.query(
      'DELETE FROM invitation_codes WHERE expires_at < NOW() AND is_active = false'
    );

    console.log('Bulk delete result:', result.rowCount);

    return NextResponse.json({
      success: true,
      message: `${result.rowCount}件の期限切れコードを削除しました`,
      deletedCount: result.rowCount,
      deletedCodes: codesToDelete
    });

  } catch (error: any) {
    console.error('Bulk delete expired codes error:', error);
    return NextResponse.json(
      { success: false, message: `サーバーエラーが発生しました: ${error.message}` },
      { status: 500 }
    );
  }
}