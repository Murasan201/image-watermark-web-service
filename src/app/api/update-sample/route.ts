import { NextResponse } from 'next/server';
import { pool } from '@/lib/database';

export async function POST() {
  try {
    const client = await pool.connect();
    
    try {
      // 現在の月の最終日を計算
      const now = new Date();
      const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const lastDayCurrentMonth = new Date(nextMonth.getTime() - 1);
      lastDayCurrentMonth.setHours(23, 59, 59, 0);

      // サンプルコードを更新
      const updateResult = await client.query(`
        UPDATE invitation_codes 
        SET month = $1, expires_at = $2
        WHERE code = '202501-SAMPLE'
      `, [currentMonth, lastDayCurrentMonth]);

      // 確認
      const checkResult = await client.query(`
        SELECT code, month, expires_at, is_active 
        FROM invitation_codes 
        WHERE code = '202501-SAMPLE'
      `);

      return NextResponse.json({
        success: true,
        updated_rows: updateResult.rowCount,
        updated_code: checkResult.rows[0],
        current_time: now.toISOString()
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}