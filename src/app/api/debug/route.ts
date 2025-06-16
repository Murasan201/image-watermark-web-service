import { NextResponse } from 'next/server';
import { pool } from '@/lib/database';

export async function GET() {
  try {
    const client = await pool.connect();
    
    try {
      // データベース接続テスト
      const result = await client.query('SELECT NOW() as current_time');
      
      // 招待コードテーブル確認
      const codesResult = await client.query(`
        SELECT code, month, expires_at, is_active, usage_count 
        FROM invitation_codes 
        ORDER BY created_at DESC
      `);
      
      return NextResponse.json({
        success: true,
        database_time: result.rows[0].current_time,
        invitation_codes: codesResult.rows,
        environment: {
          has_database_url: !!process.env.DATABASE_URL,
          database_url_length: process.env.DATABASE_URL?.length || 0
        }
      });
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      environment: {
        has_database_url: !!process.env.DATABASE_URL,
        database_url_length: process.env.DATABASE_URL?.length || 0
      }
    }, { status: 500 });
  }
}