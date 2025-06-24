# データベースマイグレーション手順 - 個別ユーザーキー機能追加

## 概要
月次招待コードに加えて、特定ユーザー向けの個別キー発行機能を追加するためのデータベーススキーマ変更です。

## 機能追加内容
- **個別ユーザーキー**: USER-XXXXX形式のキー生成
- **ユーザー情報管理**: ユーザー名、用途説明の保存
- **柔軟な有効期限**: 7日〜1年間の管理者指定期間
- **Slack通知対応**: 個別キー生成時の通知機能

## マイグレーション実行手順

### 1. 本番環境でのスキーマ変更
```sql
-- migration-user-specific-keys.sqlファイルを実行
psql [DATABASE_URL] -f migration-user-specific-keys.sql
```

### 2. 変更内容確認
```sql
-- テーブル構造確認
\d invitation_codes

-- 新しいカラムの確認
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'invitation_codes' 
AND column_name IN ('code_type', 'user_name', 'user_description');
```

### 3. 既存データの整合性確認
```sql
-- 既存の月次コードにcode_typeが設定されているか確認
SELECT code, code_type, month FROM invitation_codes WHERE month IS NOT NULL;
```

## 新機能の使用方法

### 管理画面での操作
1. **月次コード生成**：従来通りの年月指定での生成
2. **個別ユーザーキー生成**：
   - ユーザー名入力（必須）
   - 有効期限選択（7日〜1年）
   - 用途説明入力（任意）

### 生成されるコード形式
- **月次コード**: `202506-A7B9C` （YYYYMM-XXXXX）
- **個別キー**: `USER-K3N2M` （USER-XXXXX）

## データベーススキーマ変更点

### invitation_codesテーブル
```sql
-- 新規追加カラム
code_type VARCHAR(10) DEFAULT 'monthly'    -- 'monthly' または 'user_specific'
user_name VARCHAR(100)                     -- 個別ユーザー名
user_description TEXT                      -- 用途説明

-- 変更されたカラム
month VARCHAR(7)                           -- NULL許可（個別キーの場合）
```

### 新規インデックス
```sql
idx_invitation_codes_type        -- code_type検索用
idx_invitation_codes_user_name   -- user_name検索用
```

## 注意事項
- 既存の月次コードは影響を受けません
- 認証ロジックは両方のコード形式に対応済み
- Slack通知は個別キー用のメッセージ形式に対応済み
- ダウンタイムは発生しません（追加のみ）

## ロールバック手順
万が一問題が発生した場合：
```sql
-- 新規カラムの削除（注意：データが失われます）
ALTER TABLE invitation_codes 
DROP COLUMN IF EXISTS code_type,
DROP COLUMN IF EXISTS user_name,
DROP COLUMN IF EXISTS user_description;

-- インデックスの削除
DROP INDEX IF EXISTS idx_invitation_codes_type;
DROP INDEX IF EXISTS idx_invitation_codes_user_name;
```

## テスト手順
1. 管理画面ログイン確認
2. 月次コード生成テスト
3. 個別ユーザーキー生成テスト
4. 生成されたキーでの認証テスト
5. Slack通知動作確認

---
**実行日**: 2025年6月24日  
**担当**: Claude Code  
**影響範囲**: 管理機能・認証システム