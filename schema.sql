-- 画像ウォーターマークWebサービス データベーススキーマ
-- 作成日: 2025-01-16

-- 1. 招待コード管理テーブル
CREATE TABLE invitation_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,    -- YYYYMM-XXXXX形式 または USER-XXXXX形式
    code_type VARCHAR(10) DEFAULT 'monthly',  -- 'monthly' または 'user_specific'
    month VARCHAR(7),                    -- '2025-01' 形式（月次コードのみ）
    user_name VARCHAR(100),              -- 個別ユーザー名（個別コードのみ）
    user_description TEXT,               -- 個別ユーザー説明（個別コードのみ）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- 2. ユーザーセッション管理テーブル
CREATE TABLE user_sessions (
    session_id VARCHAR(36) PRIMARY KEY,
    code_used VARCHAR(20) REFERENCES invitation_codes(code),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 管理者セッション管理テーブル
CREATE TABLE admin_sessions (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(45)
);

-- 4. 管理設定テーブル（Slack Webhook等）
CREATE TABLE admin_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(50) UNIQUE NOT NULL,
    setting_value_encrypted TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(50)
);

-- 5. 処理キュー管理テーブル
CREATE TABLE processing_queue (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting',  -- 'waiting', 'processing', 'completed', 'failed'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    queue_position INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX idx_invitation_codes_month ON invitation_codes(month);
CREATE INDEX idx_invitation_codes_active ON invitation_codes(is_active);
CREATE INDEX idx_invitation_codes_type ON invitation_codes(code_type);
CREATE INDEX idx_invitation_codes_user_name ON invitation_codes(user_name);
CREATE INDEX idx_user_sessions_code ON user_sessions(code_used);
CREATE INDEX idx_user_sessions_created ON user_sessions(created_at);
CREATE INDEX idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE INDEX idx_processing_queue_status ON processing_queue(status);
CREATE INDEX idx_processing_queue_position ON processing_queue(queue_position);

-- 初期データ投入
-- 管理設定のデフォルト値
INSERT INTO admin_settings (setting_key, setting_value_encrypted, updated_by) VALUES
('slack_webhook', NULL, 'system');

-- サンプル招待コード（開発用）
INSERT INTO invitation_codes (code, month, expires_at) VALUES
('202501-SAMPLE', '2025-01', '2025-01-31 23:59:59');

-- コメント
COMMENT ON TABLE invitation_codes IS '招待コード管理（月次・個別ユーザー）';
COMMENT ON TABLE user_sessions IS 'ユーザーセッション管理';
COMMENT ON TABLE admin_sessions IS '管理者セッション管理';
COMMENT ON TABLE admin_settings IS '管理設定（暗号化保存）';
COMMENT ON TABLE processing_queue IS '画像処理キュー管理';