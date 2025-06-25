import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';

// 使用統計ログテーブル追加マイグレーション
export async function POST(request: NextRequest) {
  try {
    const db = await getDb();

    // マイグレーション実行（順次実行）
    console.log('Starting usage stats migration...');

    // 1. usage_logs テーブル作成
    await db.query(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(36) REFERENCES user_sessions(session_id),
        code_used VARCHAR(20) REFERENCES invitation_codes(code),
        
        -- 処理情報
        processing_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processing_completed_at TIMESTAMP,
        processing_duration_ms INTEGER,
        
        -- ファイル情報
        file_count INTEGER NOT NULL DEFAULT 0,
        total_file_size_bytes BIGINT NOT NULL DEFAULT 0,
        processed_file_size_bytes BIGINT DEFAULT 0,
        
        -- 処理方式・結果
        processing_method VARCHAR(20) DEFAULT 'CLIENT',
        status VARCHAR(20) DEFAULT 'SUCCESS',
        error_message TEXT,
        
        -- ウォーターマーク設定（統計用）
        watermark_font_size INTEGER,
        watermark_position VARCHAR(20),
        
        -- システム情報
        user_agent TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ usage_logs table created');

    // 2. daily_stats テーブル作成
    await db.query(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        id SERIAL PRIMARY KEY,
        stat_date DATE NOT NULL,
        code_used VARCHAR(20) REFERENCES invitation_codes(code),
        
        -- 日次集計データ
        total_sessions INTEGER DEFAULT 0,
        total_processing_count INTEGER DEFAULT 0,
        total_file_count INTEGER DEFAULT 0,
        total_file_size_bytes BIGINT DEFAULT 0,
        total_processing_time_ms BIGINT DEFAULT 0,
        
        -- 成功・失敗統計
        success_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        partial_count INTEGER DEFAULT 0,
        
        -- 処理方式別統計
        client_processing_count INTEGER DEFAULT 0,
        server_processing_count INTEGER DEFAULT 0,
        
        -- 平均値
        avg_processing_time_ms INTEGER DEFAULT 0,
        avg_file_size_bytes INTEGER DEFAULT 0,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(stat_date, code_used)
      )
    `);
    console.log('✅ daily_stats table created');

    // 3. system_status_logs テーブル作成
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_status_logs (
        id SERIAL PRIMARY KEY,
        
        -- キュー統計
        active_queue_count INTEGER DEFAULT 0,
        waiting_queue_count INTEGER DEFAULT 0,
        total_sessions_count INTEGER DEFAULT 0,
        
        -- 処理負荷統計
        current_processing_sessions INTEGER DEFAULT 0,
        peak_concurrent_users INTEGER DEFAULT 0,
        
        -- Vercel関連統計
        estimated_function_invocations INTEGER DEFAULT 0,
        estimated_data_transfer_mb DECIMAL(10,2) DEFAULT 0,
        
        -- 記録時刻
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        hour_bucket INTEGER,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ system_status_logs table created');

    // 4. インデックス作成
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_usage_logs_code_date ON usage_logs(code_used, processing_started_at)',
      'CREATE INDEX IF NOT EXISTS idx_usage_logs_session ON usage_logs(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_usage_logs_date ON usage_logs(processing_started_at)',
      'CREATE INDEX IF NOT EXISTS idx_usage_logs_status ON usage_logs(status)',
      'CREATE INDEX IF NOT EXISTS idx_usage_logs_method ON usage_logs(processing_method)',
      'CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(stat_date)',
      'CREATE INDEX IF NOT EXISTS idx_daily_stats_code ON daily_stats(code_used)',
      'CREATE INDEX IF NOT EXISTS idx_daily_stats_date_code ON daily_stats(stat_date, code_used)',
      'CREATE INDEX IF NOT EXISTS idx_system_status_recorded ON system_status_logs(recorded_at)',
      'CREATE INDEX IF NOT EXISTS idx_system_status_hour ON system_status_logs(hour_bucket)'
    ];

    for (const indexQuery of indexes) {
      await db.query(indexQuery);
    }
    console.log('✅ All indexes created');

    // 5. コメント追加
    await db.query("COMMENT ON TABLE usage_logs IS '画像処理実行ログ（詳細統計用）'");
    await db.query("COMMENT ON TABLE daily_stats IS '日次統計集計（管理画面表示最適化用）'");
    await db.query("COMMENT ON TABLE system_status_logs IS 'システム状態・負荷統計（Vercel使用量監視用）'");
    console.log('✅ Table comments added');

    // 6. 初期データ投入
    await db.query(`
      INSERT INTO system_status_logs (active_queue_count, waiting_queue_count, total_sessions_count, recorded_at) 
      VALUES (0, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Initial data inserted');

    // 7. テーブル存在確認
    const tablesCheck = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('usage_logs', 'daily_stats', 'system_status_logs')
      ORDER BY table_name
    `);

    console.log('Migration completed successfully');

    return NextResponse.json({
      success: true,
      message: '使用統計ログテーブルのマイグレーションが完了しました',
      createdTables: tablesCheck.rows.map(row => row.table_name),
      details: {
        usage_logs: '画像処理実行ログテーブル',
        daily_stats: '日次統計集計テーブル',
        system_status_logs: 'システム状態ログテーブル'
      }
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'マイグレーション実行中にエラーが発生しました',
        error: error.message,
        code: error.code
      },
      { status: 500 }
    );
  }
}

// マイグレーション状況確認
export async function GET(request: NextRequest) {
  try {
    const db = await getDb();

    // テーブル存在確認
    const tablesCheck = await db.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_name IN ('usage_logs', 'daily_stats', 'system_status_logs')
      ORDER BY table_name
    `);

    // 各テーブルのレコード数確認
    const stats = [];
    for (const table of tablesCheck.rows) {
      try {
        const countResult = await db.query(`SELECT COUNT(*) as count FROM ${table.table_name}`);
        stats.push({
          tableName: table.table_name,
          columnCount: table.column_count,
          recordCount: countResult.rows[0].count
        });
      } catch (error: any) {
        stats.push({
          tableName: table.table_name,
          columnCount: table.column_count,
          recordCount: 'ERROR',
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      migrationStatus: tablesCheck.rows.length === 3 ? 'COMPLETED' : 'PENDING',
      tables: stats,
      totalTables: tablesCheck.rows.length,
      expectedTables: 3
    });

  } catch (error: any) {
    console.error('Migration status check error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'マイグレーション状況確認中にエラーが発生しました',
        error: error.message
      },
      { status: 500 }
    );
  }
}