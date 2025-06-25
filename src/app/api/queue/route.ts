import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';

// 📊 システム状態ログ記録ヘルパー関数
async function recordSystemStatusLog(db: any) {
  try {
    // 現在のキュー・セッション状況を取得
    const queueStats = await db.query(`
      SELECT 
        COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting_count,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_count
      FROM processing_queue 
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `);

    const sessionStats = await db.query(`
      SELECT COUNT(*) as total_sessions
      FROM user_sessions 
      WHERE last_accessed > CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `);

    const currentHour = new Date().getHours();
    const stats = queueStats.rows[0];
    const sessions = sessionStats.rows[0];

    // システム状態ログを記録
    await db.query(`
      INSERT INTO system_status_logs (
        active_queue_count, waiting_queue_count, total_sessions_count,
        current_processing_sessions, hour_bucket, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [
      parseInt(stats.processing_count) || 0,
      parseInt(stats.waiting_count) || 0,
      parseInt(sessions.total_sessions) || 0,
      parseInt(stats.processing_count) || 0,
      currentHour
    ]);

    console.log(`📊 System status recorded: waiting=${stats.waiting_count}, processing=${stats.processing_count}, sessions=${sessions.total_sessions}`);
  } catch (error: any) {
    console.warn('📊 Failed to record system status log:', error.message);
    // ログ記録失敗は処理継続
  }
}

interface QueueItem {
  id: number;
  session_id: string;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string;
  queue_position?: number;
  created_at: string;
}

// キューの状態を取得
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('session_id')?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: '認証が必要です' },
        { status: 401 }
      );
    }

    const db = await getDb();
    
    // 現在のユーザーのキュー状態を取得
    const userQueueResult = await db.query(
      'SELECT * FROM processing_queue WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
      [sessionId]
    );

    // 全体のキュー状況を取得
    const queueStatsResult = await db.query(`
      SELECT 
        COUNT(*) as total_waiting,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_count,
        MIN(CASE WHEN status = 'waiting' THEN queue_position END) as next_position
      FROM processing_queue 
      WHERE status IN ('waiting', 'processing')
    `);

    const stats = queueStatsResult.rows[0];
    const userQueue = userQueueResult.rows[0] || null;

    // ユーザーの待機位置を計算
    let userPosition = null;
    if (userQueue && userQueue.status === 'waiting') {
      const positionResult = await db.query(
        'SELECT COUNT(*) as position FROM processing_queue WHERE status = $1 AND queue_position < $2',
        ['waiting', userQueue.queue_position]
      );
      userPosition = parseInt(positionResult.rows[0].position) + 1;
    }

    return NextResponse.json({
      success: true,
      userQueue,
      userPosition,
      queueStats: {
        totalWaiting: parseInt(stats.total_waiting),
        processingCount: parseInt(stats.processing_count),
        nextPosition: stats.next_position
      }
    });

  } catch (error: any) {
    console.error('Queue status error:', error);
    return NextResponse.json(
      { success: false, message: 'キュー状態の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// キューに追加
export async function POST(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('session_id')?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: '認証が必要です' },
        { status: 401 }
      );
    }

    const db = await getDb();

    // 既存の未完了キューをチェック
    const existingQueueResult = await db.query(
      'SELECT * FROM processing_queue WHERE session_id = $1 AND status IN ($2, $3)',
      [sessionId, 'waiting', 'processing']
    );

    if (existingQueueResult.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: '既に処理中または待機中です' },
        { status: 409 }
      );
    }

    // 現在処理中のキューをチェック
    const processingResult = await db.query(
      'SELECT COUNT(*) as count FROM processing_queue WHERE status = $1',
      ['processing']
    );

    const processingCount = parseInt(processingResult.rows[0].count);
    const maxConcurrent = 1; // 同時処理数制限

    let status: 'waiting' | 'processing' = 'waiting';
    let queuePosition: number | null = null;
    let startedAt: Date | null = null;

    if (processingCount < maxConcurrent) {
      // 即座に処理開始
      status = 'processing';
      startedAt = new Date();
    } else {
      // キューに追加
      const maxPositionResult = await db.query(
        'SELECT COALESCE(MAX(queue_position), 0) as max_position FROM processing_queue WHERE status = $1',
        ['waiting']
      );
      queuePosition = parseInt(maxPositionResult.rows[0].max_position) + 1;
    }

    // キューエントリを作成
    const insertResult = await db.query(
      `INSERT INTO processing_queue (session_id, status, started_at, queue_position) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [sessionId, status, startedAt, queuePosition]
    );

    const queueItem = insertResult.rows[0];

    // 📊 システム状態ログ記録（キュー参加時）
    await recordSystemStatusLog(db);

    return NextResponse.json({
      success: true,
      queueItem,
      canStartImmediately: status === 'processing'
    });

  } catch (error: any) {
    console.error('Queue addition error:', error);
    return NextResponse.json(
      { success: false, message: 'キューへの追加に失敗しました' },
      { status: 500 }
    );
  }
}

// キューから削除/完了
export async function DELETE(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('session_id')?.value;
    const url = new URL(request.url);
    const action = url.searchParams.get('action'); // 'complete' or 'cancel'
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: '認証が必要です' },
        { status: 401 }
      );
    }

    const db = await getDb();

    if (action === 'complete') {
      // 処理完了として更新
      const updateResult = await db.query(
        `UPDATE processing_queue 
         SET status = $1, completed_at = $2 
         WHERE session_id = $3 AND status = $4 
         RETURNING *`,
        ['completed', new Date(), sessionId, 'processing']
      );

      if (updateResult.rows.length === 0) {
        return NextResponse.json(
          { success: false, message: '処理中のキューが見つかりません' },
          { status: 404 }
        );
      }

      // 次の待機中キューを処理開始状態に更新
      await promoteNextQueue(db);

      // 📊 システム状態ログ記録（処理完了時）
      await recordSystemStatusLog(db);

      return NextResponse.json({
        success: true,
        message: '処理が完了しました',
        completedItem: updateResult.rows[0]
      });

    } else {
      // キューから削除（キャンセル）
      const deleteResult = await db.query(
        'DELETE FROM processing_queue WHERE session_id = $1 AND status IN ($2, $3) RETURNING *',
        [sessionId, 'waiting', 'processing']
      );

      if (deleteResult.rows.length === 0) {
        return NextResponse.json(
          { success: false, message: 'キューエントリが見つかりません' },
          { status: 404 }
        );
      }

      const deletedItem = deleteResult.rows[0];

      // 処理中だった場合は次のキューを促進
      if (deletedItem.status === 'processing') {
        await promoteNextQueue(db);
      }

      // 📊 システム状態ログ記録（キュー削除時）
      await recordSystemStatusLog(db);

      return NextResponse.json({
        success: true,
        message: 'キューから削除しました',
        deletedItem
      });
    }

  } catch (error: any) {
    console.error('Queue deletion error:', error);
    return NextResponse.json(
      { success: false, message: 'キューの操作に失敗しました' },
      { status: 500 }
    );
  }
}

// 次の待機キューを処理開始状態に促進
async function promoteNextQueue(db: any) {
  try {
    // 最も古い待機中キューを取得
    const nextQueueResult = await db.query(
      'SELECT * FROM processing_queue WHERE status = $1 ORDER BY queue_position ASC LIMIT 1',
      ['waiting']
    );

    if (nextQueueResult.rows.length > 0) {
      const nextQueue = nextQueueResult.rows[0];
      
      // 処理開始状態に更新
      await db.query(
        'UPDATE processing_queue SET status = $1, started_at = $2, queue_position = NULL WHERE id = $3',
        ['processing', new Date(), nextQueue.id]
      );

      console.log(`Queue promoted: session ${nextQueue.session_id}`);
    }
  } catch (error: any) {
    console.error('Error promoting next queue:', error);
  }
}