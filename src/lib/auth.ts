import { pool } from './database';
import { v4 as uuidv4 } from 'uuid';

export interface InvitationCode {
  id: number;
  code: string;
  code_type?: string;
  month?: string;
  user_name?: string;
  user_description?: string;
  created_at: Date;
  expires_at: Date;
  usage_count: number;
  is_active: boolean;
}

export interface UserSession {
  session_id: string;
  code_used: string;
  ip_address: string;
  user_agent: string;
  created_at: Date;
  last_accessed: Date;
}

/**
 * 招待コードの有効性を検証
 */
export async function verifyInvitationCode(code: string): Promise<InvitationCode | null> {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT * FROM invitation_codes 
       WHERE code = $1 AND is_active = true AND expires_at > NOW()`,
      [code]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0] as InvitationCode;
  } finally {
    client.release();
  }
}

/**
 * 招待コードの使用回数を増加
 */
export async function incrementCodeUsage(code: string): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query(
      `UPDATE invitation_codes 
       SET usage_count = usage_count + 1 
       WHERE code = $1`,
      [code]
    );
  } finally {
    client.release();
  }
}

/**
 * ユーザーセッションを作成
 */
export async function createUserSession(
  codeUsed: string,
  ipAddress: string,
  userAgent: string
): Promise<string> {
  const sessionId = uuidv4();
  const client = await pool.connect();
  
  try {
    await client.query(
      `INSERT INTO user_sessions (session_id, code_used, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, codeUsed, ipAddress, userAgent]
    );
    
    return sessionId;
  } finally {
    client.release();
  }
}

/**
 * ユーザーセッションを検証
 */
export async function verifyUserSession(sessionId: string): Promise<UserSession | null> {
  const client = await pool.connect();
  
  try {
    // セッション取得と最終アクセス時間更新
    await client.query(
      `UPDATE user_sessions 
       SET last_accessed = NOW() 
       WHERE session_id = $1`,
      [sessionId]
    );
    
    const result = await client.query(
      `SELECT us.*, ic.expires_at as code_expires_at
       FROM user_sessions us
       JOIN invitation_codes ic ON us.code_used = ic.code
       WHERE us.session_id = $1 AND ic.expires_at > NOW()`,
      [sessionId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0] as UserSession;
  } finally {
    client.release();
  }
}

/**
 * 期限切れセッションをクリーンアップ
 */
export async function cleanupExpiredSessions(): Promise<void> {
  const client = await pool.connect();
  
  try {
    // 招待コードが期限切れのセッションを削除
    await client.query(
      `DELETE FROM user_sessions 
       WHERE code_used IN (
         SELECT code FROM invitation_codes 
         WHERE expires_at <= NOW()
       )`
    );
  } finally {
    client.release();
  }
}