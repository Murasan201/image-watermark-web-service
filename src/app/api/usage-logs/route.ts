import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';

// 使用統計ログ記録
export async function POST(request: NextRequest) {
  try {
    const {
      sessionId,
      fileCount,
      totalFileSizeBytes,
      processedFileSizeBytes,
      processingDurationMs,
      processingMethod,
      status,
      errorMessage,
      watermarkSettings
    } = await request.json();

    // 必須パラメータチェック
    if (!sessionId || fileCount === undefined) {
      return NextResponse.json(
        { success: false, message: '必須パラメータが不足しています' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // セッション情報から招待コードを取得
    const sessionData = await db.query(
      'SELECT code_used FROM user_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionData.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '有効なセッションが見つかりません' },
        { status: 404 }
      );
    }

    const codeUsed = sessionData.rows[0].code_used;

    // クライアント情報取得
    const userAgent = request.headers.get('user-agent') || '';
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';

    // 使用ログを記録
    const logResult = await db.query(`
      INSERT INTO usage_logs (
        session_id, code_used, processing_started_at, processing_completed_at,
        processing_duration_ms, file_count, total_file_size_bytes, 
        processed_file_size_bytes, processing_method, status, error_message,
        watermark_font_size, watermark_position, user_agent, ip_address
      ) VALUES (
        $1, $2, NOW() - INTERVAL '1 millisecond' * $3, NOW(),
        $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING id
    `, [
      sessionId,
      codeUsed,
      processingDurationMs || 0, // 処理開始時刻計算用
      processingDurationMs || 0,
      fileCount,
      totalFileSizeBytes || 0,
      processedFileSizeBytes || totalFileSizeBytes || 0,
      processingMethod || 'CLIENT',
      status || 'SUCCESS',
      errorMessage || null,
      watermarkSettings?.fontSize || null,
      watermarkSettings?.position || null,
      userAgent,
      ipAddress
    ]);

    const logId = logResult.rows[0].id;

    // 日次統計を更新（UPSERT）
    await updateDailyStats(db, codeUsed, {
      fileCount,
      totalFileSizeBytes: totalFileSizeBytes || 0,
      processingDurationMs: processingDurationMs || 0,
      processingMethod: processingMethod || 'CLIENT',
      status: status || 'SUCCESS'
    });

    console.log(`📊 Usage log recorded: ID=${logId}, Code=${codeUsed}, Files=${fileCount}, Method=${processingMethod}`);

    return NextResponse.json({
      success: true,
      logId,
      message: '使用統計ログを記録しました'
    });

  } catch (error: any) {
    console.error('Usage log recording error:', error);
    return NextResponse.json(
      { success: false, message: `ログ記録中にエラーが発生しました: ${error.message}` },
      { status: 500 }
    );
  }
}

// 日次統計更新
async function updateDailyStats(db: any, codeUsed: string, logData: {
  fileCount: number;
  totalFileSizeBytes: number;
  processingDurationMs: number;
  processingMethod: string;
  status: string;
}) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式

  // 処理方式別カウント
  const clientCount = logData.processingMethod === 'CLIENT' ? 1 : 0;
  const serverCount = logData.processingMethod === 'SERVER' ? 1 : 0;

  // ステータス別カウント
  const successCount = logData.status === 'SUCCESS' ? 1 : 0;
  const failedCount = logData.status === 'FAILED' ? 1 : 0;
  const partialCount = logData.status === 'PARTIAL' ? 1 : 0;

  try {
    await db.query(`
      INSERT INTO daily_stats (
        stat_date, code_used, total_sessions, total_processing_count, 
        total_file_count, total_file_size_bytes, total_processing_time_ms,
        success_count, failed_count, partial_count,
        client_processing_count, server_processing_count
      ) VALUES (
        $1, $2, 1, 1, $3, $4, $5, $6, $7, $8, $9, $10
      )
      ON CONFLICT (stat_date, code_used) DO UPDATE SET
        total_processing_count = daily_stats.total_processing_count + 1,
        total_file_count = daily_stats.total_file_count + $3,
        total_file_size_bytes = daily_stats.total_file_size_bytes + $4,
        total_processing_time_ms = daily_stats.total_processing_time_ms + $5,
        success_count = daily_stats.success_count + $6,
        failed_count = daily_stats.failed_count + $7,
        partial_count = daily_stats.partial_count + $8,
        client_processing_count = daily_stats.client_processing_count + $9,
        server_processing_count = daily_stats.server_processing_count + $10,
        avg_processing_time_ms = (daily_stats.total_processing_time_ms + $5) / (daily_stats.total_processing_count + 1),
        avg_file_size_bytes = (daily_stats.total_file_size_bytes + $4) / (daily_stats.total_file_count + $3),
        updated_at = CURRENT_TIMESTAMP
    `, [
      today, codeUsed, logData.fileCount, logData.totalFileSizeBytes, 
      logData.processingDurationMs, successCount, failedCount, partialCount,
      clientCount, serverCount
    ]);

    console.log(`📈 Daily stats updated for ${today}, code: ${codeUsed}`);
  } catch (statsError: any) {
    console.error('Daily stats update error:', statsError);
    // 日次統計の更新エラーは処理を継続
  }
}

// 現在の使用統計取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: 'セッションIDが必要です' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // セッションの使用統計を取得
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_processing_count,
        SUM(file_count) as total_file_count,
        SUM(total_file_size_bytes) as total_file_size_bytes,
        AVG(processing_duration_ms) as avg_processing_time_ms,
        COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count,
        COUNT(CASE WHEN processing_method = 'CLIENT' THEN 1 END) as client_processing_count,
        COUNT(CASE WHEN processing_method = 'SERVER' THEN 1 END) as server_processing_count
      FROM usage_logs 
      WHERE session_id = $1
    `, [sessionId]);

    return NextResponse.json({
      success: true,
      stats: stats.rows[0]
    });

  } catch (error: any) {
    console.error('Usage stats retrieval error:', error);
    return NextResponse.json(
      { success: false, message: `統計取得中にエラーが発生しました: ${error.message}` },
      { status: 500 }
    );
  }
}