import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const envCheck = {
      ADMIN_USERNAME: process.env.ADMIN_USERNAME ? 'SET' : 'NOT_SET',
      ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH ? 'SET' : 'NOT_SET',
      JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT_SET',
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
      ENCRYPT_KEY: process.env.ENCRYPT_KEY ? 'SET' : 'NOT_SET',
      NODE_ENV: process.env.NODE_ENV
    };

    return NextResponse.json({
      success: true,
      environment: envCheck,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}