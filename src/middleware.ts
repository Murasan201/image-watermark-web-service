import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// JWT秘密鍵
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'admin-secret-key-change-in-production'
);

export async function middleware(request: NextRequest) {
  // 認証が不要なパス
  const publicPaths = ['/auth', '/api/auth/verify', '/api/debug', '/api/update-sample', '/api/test-sharp', '/api/queue/cleanup', '/api/admin/env-check'];
  const isPublicPath = publicPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  );

  // 管理画面パス（UIページのみ）
  const isAdminPath = request.nextUrl.pathname.startsWith('/admin') && !request.nextUrl.pathname.startsWith('/api/admin');
  
  // 管理者API パス（認証が必要）
  const isAdminApiPath = request.nextUrl.pathname.startsWith('/api/admin');
  
  // 管理者認証APIパス（認証不要）
  const isAdminAuthPath = request.nextUrl.pathname === '/api/admin/auth';

  // デバッグログ追加
  console.log('Middleware Debug:', {
    pathname: request.nextUrl.pathname,
    isPublicPath,
    isAdminPath,
    isAdminApiPath,
    isAdminAuthPath
  });

  // 管理者認証APIの処理（認証不要）
  if (isAdminAuthPath) {
    return NextResponse.next();
  }

  // 管理者API の処理（認証が必要）
  if (isAdminApiPath) {
    console.log('Processing admin API path:', request.nextUrl.pathname);
    const adminToken = request.cookies.get('admin-token')?.value;
    console.log('Admin token exists:', !!adminToken);
    
    if (!adminToken) {
      console.log('No admin token, returning 401');
      return NextResponse.json(
        { success: false, message: '管理者認証が必要です' },
        { status: 401 }
      );
    }

    try {
      // JWT検証
      const { payload } = await jwtVerify(adminToken, JWT_SECRET);
      
      if (payload.type !== 'admin-session') {
        throw new Error('Invalid admin token');
      }
      
      console.log('Admin token valid, proceeding');
      return NextResponse.next();
    } catch (error) {
      console.log('Admin token invalid:', error.message);
      return NextResponse.json(
        { success: false, message: '管理者認証に失敗しました' },
        { status: 401 }
      );
    }
  }

  // 管理画面UI の処理
  if (isAdminPath) {
    // 管理者ログインページは認証不要
    if (request.nextUrl.pathname === '/admin/login') {
      return NextResponse.next();
    }

    // 管理画面は管理者認証が必要
    const adminToken = request.cookies.get('admin-token')?.value;
    
    if (!adminToken) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }

    try {
      // JWT検証
      const { payload } = await jwtVerify(adminToken, JWT_SECRET);
      
      if (payload.type !== 'admin-session') {
        throw new Error('Invalid admin token');
      }
      
      return NextResponse.next();
    } catch (error) {
      // トークンが無効な場合はログインページにリダイレクト
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }
  }

  // 公開パスはそのまま通す
  if (isPublicPath) {
    return NextResponse.next();
  }

  // 一般ユーザーの認証チェック
  const sessionId = request.cookies.get('session_id')?.value;

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