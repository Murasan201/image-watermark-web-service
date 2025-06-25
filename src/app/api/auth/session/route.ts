import { NextRequest, NextResponse } from 'next/server';
import { verifyUserSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // CookieからセッションIDを取得
    const sessionId = request.cookies.get('session_id')?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'セッションが見つかりません' },
        { status: 401 }
      );
    }
    
    // セッション検証
    const session = await verifyUserSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'セッションが無効または期限切れです' },
        { status: 401 }
      );
    }
    
    // セッション情報を返す
    return NextResponse.json({
      success: true,
      session: {
        sessionId: session.session_id,
        codeUsed: session.code_used,
        createdAt: session.created_at,
        lastAccessed: session.last_accessed
      }
    });
    
  } catch (error: any) {
    console.error('Session verification error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // ログアウト処理
    const response = NextResponse.json({
      success: true,
      message: 'ログアウトしました'
    });
    
    // Cookieを削除
    response.cookies.delete('session_id');
    
    return response;
    
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}