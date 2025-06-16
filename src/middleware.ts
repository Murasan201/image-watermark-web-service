import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // 認証が不要なパス
  const publicPaths = ['/auth', '/api/auth/verify', '/api/debug'];
  const isPublicPath = publicPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  );

  // 管理画面パス
  const isAdminPath = request.nextUrl.pathname.startsWith('/admin');

  // セッションIDを取得
  const sessionId = request.cookies.get('session_id')?.value;

  // 管理画面は別途管理者認証で処理（後で実装）
  if (isAdminPath) {
    return NextResponse.next();
  }

  // 公開パスはそのまま通す
  if (isPublicPath) {
    return NextResponse.next();
  }

  // セッションがない場合は認証ページにリダイレクト
  if (!sessionId) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};