import { Pool } from 'pg';

// PostgreSQL接続プールを作成
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // 接続プール設定（Neon無料プラン対応）
  max: 5, // 最大接続数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export { pool };