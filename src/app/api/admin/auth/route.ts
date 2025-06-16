import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { getDb } from '@/lib/database';

// 環境変数からシークレットキーを取得
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'admin-secret-key-change-in-production'
);

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    // 入力値検証
    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: 'ユーザー名とパスワードを入力してください' },
        { status: 400 }
      );
    }

    // 環境変数から管理者認証情報を取得
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminUsername || !adminPasswordHash) {
      console.error('Admin credentials not configured');
      return NextResponse.json(
        { success: false, message: '管理者認証が設定されていません' },
        { status: 500 }
      );
    }

    // ユーザー名チェック
    if (username !== adminUsername) {
      return NextResponse.json(
        { success: false, message: '認証に失敗しました' },
        { status: 401 }
      );
    }

    // パスワード検証
    const isPasswordValid = await bcrypt.compare(password, adminPasswordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, message: '認証に失敗しました' },
        { status: 401 }
      );
    }

    // JWTトークン生成（24時間有効）
    const token = await new SignJWT({ 
      username: adminUsername,
      role: 'admin',
      type: 'admin-session'
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(JWT_SECRET);

    // データベースに管理者セッションを記録
    const db = await getDb();
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間後

    await db.query(
      `INSERT INTO admin_sessions (session_id, username, expires_at, created_at) 
       VALUES ($1, $2, $3, NOW())`,
      [sessionId, adminUsername, expiresAt]
    );

    // レスポンスにクッキーを設定
    const response = NextResponse.json({
      success: true,
      message: '管理者として認証されました',
      token
    });

    response.cookies.set('admin-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 // 24時間
    });

    return response;

  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { success: false, message: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// 管理者セッション確認
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('admin-token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: '認証が必要です' },
        { status: 401 }
      );
    }

    // JWT検証
    const { jwtVerify } = await import('jose');
    const { payload } = await jwtVerify(token, JWT_SECRET);

    if (payload.type !== 'admin-session') {
      return NextResponse.json(
        { success: false, message: '無効なトークンです' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      admin: {
        username: payload.username,
        role: payload.role
      }
    });

  } catch (error) {
    console.error('Admin session check error:', error);
    return NextResponse.json(
      { success: false, message: '認証に失敗しました' },
      { status: 401 }
    );
  }
}

// ログアウト
export async function DELETE(request: NextRequest) {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'ログアウトしました'
    });

    // クッキーを削除
    response.cookies.set('admin-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0
    });

    return response;

  } catch (error) {
    console.error('Admin logout error:', error);
    return NextResponse.json(
      { success: false, message: 'ログアウトに失敗しました' },
      { status: 500 }
    );
  }
}