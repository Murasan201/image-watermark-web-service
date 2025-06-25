import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';

// 招待コード無効化（POST方式）
export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    console.log('POST deactivate request - code:', code);

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

  } catch (error: any) {
    console.error('Deactivate invitation code error:', error);
    return NextResponse.json(
      { success: false, message: `サーバーエラー: ${error.message}` },
      { status: 500 }
    );
  }
}