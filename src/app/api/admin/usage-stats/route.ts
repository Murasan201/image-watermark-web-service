import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';

// 使用統計取得API（管理者専用）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview'; // overview, daily, monthly, realtime
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const codeFilter = searchParams.get('code');

    const db = await getDb();

    switch (type) {
      case 'overview':
        return await getOverviewStats(db);
      case 'daily':
        return await getDailyStats(db, startDate, endDate, codeFilter);
      case 'monthly':
        return await getMonthlyStats(db, codeFilter);
      case 'realtime':
        return await getRealtimeStats(db);
      case 'codes':
        return await getCodeStats(db);
      default:
        return NextResponse.json(
          { success: false, message: '無効な統計タイプです' },
          { status: 400 }
        );
    }

  } catch (error: any) {
    console.error('Usage stats retrieval error:', error);
    return NextResponse.json(
      { success: false, message: `統計取得中にエラーが発生しました: ${error.message}` },
      { status: 500 }
    );
  }
}

// 概要統計（ダッシュボード用）
async function getOverviewStats(db: any) {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // 今日の統計
  const todayStats = await db.query(`
    SELECT 
      COALESCE(SUM(total_processing_count), 0) as today_processing_count,
      COALESCE(SUM(total_file_count), 0) as today_file_count,
      COALESCE(SUM(total_file_size_bytes), 0) as today_data_processed,
      COALESCE(AVG(avg_processing_time_ms), 0) as today_avg_processing_time
    FROM daily_stats 
    WHERE stat_date = $1
  `, [today]);

  // 今月の統計
  const monthStats = await db.query(`
    SELECT 
      COALESCE(SUM(total_processing_count), 0) as month_processing_count,
      COALESCE(SUM(total_file_count), 0) as month_file_count,
      COALESCE(SUM(total_file_size_bytes), 0) as month_data_processed,
      COUNT(DISTINCT code_used) as active_codes_count
    FROM daily_stats 
    WHERE stat_date >= ($1 || '-01')::date
  `, [thisMonth]);

  // リアルタイム状況
  const realtimeStats = await db.query(`
    SELECT 
      (SELECT COUNT(*) FROM processing_queue WHERE status = 'processing') as current_processing,
      (SELECT COUNT(*) FROM processing_queue WHERE status = 'waiting') as current_waiting,
      (SELECT COUNT(*) FROM user_sessions WHERE last_accessed > NOW() - INTERVAL '1 hour') as active_sessions
  `);

  // 過去7日間のトレンド
  const trendStats = await db.query(`
    SELECT 
      stat_date,
      SUM(total_processing_count) as daily_processing_count,
      SUM(total_file_count) as daily_file_count,
      SUM(total_file_size_bytes) as daily_data_processed
    FROM daily_stats 
    WHERE stat_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY stat_date
    ORDER BY stat_date DESC
  `);

  // エラー統計
  const errorStats = await db.query(`
    SELECT 
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as total_failed,
      COUNT(CASE WHEN status = 'PARTIAL' THEN 1 END) as total_partial,
      COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as total_success
    FROM usage_logs 
    WHERE processing_started_at >= CURRENT_DATE - INTERVAL '30 days'
  `);

  // データが空の場合のデフォルト値を設定
  const defaultStats = {
    today_processing_count: 0,
    today_file_count: 0,
    today_data_processed: 0,
    today_avg_processing_time: 0
  };

  const defaultMonthStats = {
    month_processing_count: 0,
    month_file_count: 0,
    month_data_processed: 0,
    active_codes_count: 0
  };

  const defaultRealtimeStats = {
    current_processing: 0,
    current_waiting: 0,
    active_sessions: 0
  };

  const defaultErrorStats = {
    total_failed: 0,
    total_partial: 0,
    total_success: 0
  };

  return NextResponse.json({
    success: true,
    overview: {
      today: { ...defaultStats, ...todayStats.rows[0] },
      month: { ...defaultMonthStats, ...monthStats.rows[0] },
      realtime: { ...defaultRealtimeStats, ...realtimeStats.rows[0] },
      trend: trendStats.rows || [],
      errors: { ...defaultErrorStats, ...errorStats.rows[0] }
    }
  });
}

// 日次統計
async function getDailyStats(db: any, startDate: string | null, endDate: string | null, codeFilter: string | null) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30日前
  const end = endDate || new Date().toISOString().split('T')[0]; // 今日

  let query = `
    SELECT 
      stat_date,
      code_used,
      total_processing_count,
      total_file_count,
      total_file_size_bytes,
      avg_processing_time_ms,
      success_count,
      failed_count,
      partial_count,
      client_processing_count,
      server_processing_count
    FROM daily_stats 
    WHERE stat_date BETWEEN $1 AND $2
  `;
  const params = [start, end];

  if (codeFilter) {
    query += ` AND code_used = $3`;
    params.push(codeFilter);
  }

  query += ` ORDER BY stat_date DESC, code_used`;

  const dailyStats = await db.query(query, params);

  // 集計データ
  const summary = await db.query(`
    SELECT 
      COUNT(DISTINCT stat_date) as total_days,
      COUNT(DISTINCT code_used) as unique_codes,
      SUM(total_processing_count) as total_processing,
      SUM(total_file_count) as total_files,
      SUM(total_file_size_bytes) as total_data_size,
      AVG(avg_processing_time_ms) as avg_processing_time
    FROM daily_stats 
    WHERE stat_date BETWEEN $1 AND $2
    ${codeFilter ? 'AND code_used = $3' : ''}
  `, codeFilter ? [start, end, codeFilter] : [start, end]);

  return NextResponse.json({
    success: true,
    daily: {
      period: { startDate: start, endDate: end, codeFilter },
      summary: summary.rows[0],
      data: dailyStats.rows
    }
  });
}

// 月次統計
async function getMonthlyStats(db: any, codeFilter: string | null) {
  let query = `
    SELECT 
      DATE_TRUNC('month', stat_date)::date as month,
      code_used,
      SUM(total_processing_count) as month_processing_count,
      SUM(total_file_count) as month_file_count,
      SUM(total_file_size_bytes) as month_data_processed,
      AVG(avg_processing_time_ms) as month_avg_processing_time,
      SUM(success_count) as month_success_count,
      SUM(failed_count) as month_failed_count,
      COUNT(DISTINCT stat_date) as active_days
    FROM daily_stats 
    WHERE stat_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
  `;
  const params: any[] = [];

  if (codeFilter) {
    query += ` AND code_used = $1`;
    params.push(codeFilter);
  }

  query += `
    GROUP BY DATE_TRUNC('month', stat_date), code_used
    ORDER BY month DESC, code_used
  `;

  const monthlyStats = await db.query(query, params);

  return NextResponse.json({
    success: true,
    monthly: {
      codeFilter,
      data: monthlyStats.rows
    }
  });
}

// リアルタイム統計
async function getRealtimeStats(db: any) {
  // 現在のキュー状況
  const queueStats = await db.query(`
    SELECT 
      status,
      COUNT(*) as count,
      AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))) as avg_wait_time_seconds
    FROM processing_queue 
    WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
    GROUP BY status
  `);

  // アクティブセッション
  const sessionStats = await db.query(`
    SELECT 
      COUNT(*) as total_active_sessions,
      COUNT(DISTINCT code_used) as unique_codes_active,
      AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_accessed))) as avg_idle_time_seconds
    FROM user_sessions 
    WHERE last_accessed > CURRENT_TIMESTAMP - INTERVAL '1 hour'
  `);

  // 最近の処理ログ（過去1時間）
  const recentActivity = await db.query(`
    SELECT 
      COUNT(*) as recent_processing_count,
      SUM(file_count) as recent_file_count,
      SUM(total_file_size_bytes) as recent_data_processed,
      AVG(processing_duration_ms) as recent_avg_duration,
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as recent_failed_count
    FROM usage_logs 
    WHERE processing_started_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
  `);

  // 時間別処理数（過去24時間）
  const hourlyActivity = await db.query(`
    SELECT 
      EXTRACT(HOUR FROM processing_started_at) as hour,
      COUNT(*) as processing_count,
      SUM(file_count) as file_count
    FROM usage_logs 
    WHERE processing_started_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    GROUP BY EXTRACT(HOUR FROM processing_started_at)
    ORDER BY hour
  `);

  return NextResponse.json({
    success: true,
    realtime: {
      queue: queueStats.rows,
      sessions: sessionStats.rows[0],
      recentActivity: recentActivity.rows[0],
      hourlyActivity: hourlyActivity.rows,
      timestamp: new Date().toISOString()
    }
  });
}

// 招待コード別統計
async function getCodeStats(db: any) {
  const codeStats = await db.query(`
    SELECT 
      ic.code,
      ic.code_type,
      ic.month,
      ic.user_name,
      ic.created_at as code_created_at,
      ic.expires_at,
      ic.is_active,
      COALESCE(ds.total_processing_count, 0) as total_processing_count,
      COALESCE(ds.total_file_count, 0) as total_file_count,
      COALESCE(ds.total_data_processed, 0) as total_data_processed,
      COALESCE(ds.avg_processing_time, 0) as avg_processing_time,
      COALESCE(us.active_sessions_count, 0) as active_sessions_count
    FROM invitation_codes ic
    LEFT JOIN (
      SELECT 
        code_used,
        SUM(total_processing_count) as total_processing_count,
        SUM(total_file_count) as total_file_count,
        SUM(total_file_size_bytes) as total_data_processed,
        AVG(avg_processing_time_ms) as avg_processing_time
      FROM daily_stats 
      GROUP BY code_used
    ) ds ON ic.code = ds.code_used
    LEFT JOIN (
      SELECT 
        code_used,
        COUNT(*) as active_sessions_count
      FROM user_sessions 
      WHERE last_accessed > CURRENT_TIMESTAMP - INTERVAL '24 hours'
      GROUP BY code_used
    ) us ON ic.code = us.code_used
    ORDER BY ic.created_at DESC
  `);

  return NextResponse.json({
    success: true,
    codes: codeStats.rows
  });
}