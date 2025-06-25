-- 使用統計ログテーブル追加マイグレーション
-- 作成日: 2025-06-25
-- 目的: システム稼働状況とVercel有料プラン検討のための使用統計収集

-- 6. 画像処理実行ログテーブル
CREATE TABLE IF NOT EXISTS usage_logs (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(36) REFERENCES user_sessions(session_id),
    code_used VARCHAR(20) REFERENCES invitation_codes(code),
    
    -- 処理情報
    processing_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_completed_at TIMESTAMP,
    processing_duration_ms INTEGER, -- 処理時間（ミリ秒）
    
    -- ファイル情報
    file_count INTEGER NOT NULL DEFAULT 0,
    total_file_size_bytes BIGINT NOT NULL DEFAULT 0,
    processed_file_size_bytes BIGINT DEFAULT 0,
    
    -- 処理方式・結果
    processing_method VARCHAR(20) DEFAULT 'CLIENT', -- 'CLIENT' または 'SERVER'
    status VARCHAR(20) DEFAULT 'SUCCESS', -- 'SUCCESS', 'FAILED', 'PARTIAL'
    error_message TEXT,
    
    -- ウォーターマーク設定（統計用）
    watermark_font_size INTEGER,
    watermark_position VARCHAR(20),
    
    -- システム情報
    user_agent TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. 日次統計集計テーブル（パフォーマンス最適化用）
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
);

-- 8. システム状態ログテーブル（キュー・負荷状況）
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
    hour_bucket INTEGER, -- 時間別集計用（0-23）
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成（パフォーマンス最適化）
CREATE INDEX IF NOT EXISTS idx_usage_logs_code_date ON usage_logs(code_used, processing_started_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_session ON usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_date ON usage_logs(processing_started_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_status ON usage_logs(status);
CREATE INDEX IF NOT EXISTS idx_usage_logs_method ON usage_logs(processing_method);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(stat_date);
CREATE INDEX IF NOT EXISTS idx_daily_stats_code ON daily_stats(code_used);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date_code ON daily_stats(stat_date, code_used);

CREATE INDEX IF NOT EXISTS idx_system_status_recorded ON system_status_logs(recorded_at);
CREATE INDEX IF NOT EXISTS idx_system_status_hour ON system_status_logs(hour_bucket);

-- コメント追加
COMMENT ON TABLE usage_logs IS '画像処理実行ログ（詳細統計用）';
COMMENT ON TABLE daily_stats IS '日次統計集計（管理画面表示最適化用）';
COMMENT ON TABLE system_status_logs IS 'システム状態・負荷統計（Vercel使用量監視用）';

-- 初期データ（テスト用）
INSERT INTO system_status_logs (active_queue_count, waiting_queue_count, total_sessions_count, recorded_at) VALUES
(0, 0, 0, CURRENT_TIMESTAMP);