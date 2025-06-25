import { NextRequest, NextResponse } from 'next/server';
import { verifyInvitationCode, incrementCodeUsage, createUserSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    
    // バリデーション
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: '招待コードが必要です' },
        { status: 400 }
      );
    }
    
    // コード形式チェック（YYYYMM-XXXXX または USER-XXXXX）
    const monthlyCodePattern = /^\d{6}-[A-Z0-9]+$/;     // 月次コード: 202501-XXXXX
    const userSpecificPattern = /^USER-[A-Z0-9]+$/;     // 個別ユーザーキー: USER-XXXXX
    
    if (!monthlyCodePattern.test(code) && !userSpecificPattern.test(code)) {
      return NextResponse.json(
        { error: '招待コードの形式が正しくありません' },
        { status: 400 }
      );
    }
    
    // 招待コード検証
    const invitationCode = await verifyInvitationCode(code);
    if (!invitationCode) {
      return NextResponse.json(
        { error: '無効または期限切れの招待コードです' },
        { status: 401 }
      );
    }
    
    // クライアント情報取得
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // セッション作成
    const sessionId = await createUserSession(code, ipAddress, userAgent);
    
    // 使用回数増加
    await incrementCodeUsage(code);
    
    // レスポンス
    const response = NextResponse.json({
      success: true,
      message: '認証に成功しました',
      session: {
        sessionId,
        expiresAt: invitationCode.expires_at
      }
    });
    
    // セッションIDをCookieに設定
    response.cookies.set('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(invitationCode.expires_at)
    });
    
    return response;
    
  } catch (error: any) {
    console.error('Authentication error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}