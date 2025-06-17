import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';

// キュークリーンアップAPI（タイムアウト処理）
export async function POST(request: NextRequest) {
  try {
    const db = await getDb();

    // 10分以上経過した処理中キューを検索
    const timeoutThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10分前

    const timeoutQueueResult = await db.query(
      'SELECT * FROM processing_queue WHERE status = $1 AND started_at < $2',
      ['processing', timeoutThreshold]
    );

    const timeoutItems = timeoutQueueResult.rows;
    const timeoutCount = timeoutItems.length;

    if (timeoutCount > 0) {
      // タイムアウトしたキューを失敗状態に更新
      await db.query(
        'UPDATE processing_queue SET status = $1, completed_at = $2 WHERE status = $3 AND started_at < $4',
        ['failed', new Date(), 'processing', timeoutThreshold]
      );

      console.log(`Cleaned up ${timeoutCount} timeout queue items:`, timeoutItems.map(item => item.session_id));

      // 次の待機キューを処理開始状態に促進
      for (let i = 0; i < timeoutCount; i++) {
        await promoteNextQueue(db);
      }
    }

    // 24時間以上経過した完了/失敗キューを削除
    const cleanupThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24時間前

    const cleanupResult = await db.query(
      'DELETE FROM processing_queue WHERE status IN ($1, $2) AND completed_at < $3',
      ['completed', 'failed', cleanupThreshold]
    );

    const cleanupCount = cleanupResult.rowCount || 0;

    return NextResponse.json({
      success: true,
      timeoutCount,
      cleanupCount,
      message: `タイムアウト: ${timeoutCount}件、クリーンアップ: ${cleanupCount}件`
    });

  } catch (error) {
    console.error('Queue cleanup error:', error);
    return NextResponse.json(
      { success: false, message: 'キュークリーンアップに失敗しました' },
      { status: 500 }
    );
  }
}

// 手動でのキューリセット（緊急時用）
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';

    if (!force) {
      return NextResponse.json(
        { success: false, message: 'force=trueパラメータが必要です' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // すべての未完了キューを強制リセット
    const resetResult = await db.query(
      'UPDATE processing_queue SET status = $1, completed_at = $2 WHERE status IN ($3, $4)',
      ['failed', new Date(), 'waiting', 'processing']
    );

    const resetCount = resetResult.rowCount || 0;

    console.log(`Force reset ${resetCount} queue items`);

    return NextResponse.json({
      success: true,
      resetCount,
      message: `${resetCount}件のキューを強制リセットしました`
    });

  } catch (error) {
    console.error('Queue force reset error:', error);
    return NextResponse.json(
      { success: false, message: 'キューの強制リセットに失敗しました' },
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
  } catch (error) {
    console.error('Error promoting next queue:', error);
  }
}