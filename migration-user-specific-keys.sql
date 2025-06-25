-- マイグレーション: 個別ユーザーキー機能追加
-- 実行日: 2025-06-24

-- 1. 新しいカラムを追加
ALTER TABLE invitation_codes 
ADD COLUMN IF NOT EXISTS code_type VARCHAR(20) DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS user_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS user_description TEXT;

-- 2. 月次コードの場合はmonthを必須に、個別コードの場合はuser_nameを必須にするための制約は後で追加
-- （現在のデータを壊さないため、段階的に実施）

-- 3. 新しいインデックスを作成
CREATE INDEX IF NOT EXISTS idx_invitation_codes_type ON invitation_codes(code_type);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_user_name ON invitation_codes(user_name);

-- 4. 既存データに対してcode_typeを設定
UPDATE invitation_codes 
SET code_type = 'monthly' 
WHERE code_type IS NULL AND month IS NOT NULL;

-- 5. コメント更新
COMMENT ON TABLE invitation_codes IS '招待コード管理（月次・個別ユーザー）';
COMMENT ON COLUMN invitation_codes.code_type IS 'monthly: 月次コード, user_specific: 個別ユーザーコード';
COMMENT ON COLUMN invitation_codes.user_name IS '個別ユーザー名（個別コードの場合のみ）';
COMMENT ON COLUMN invitation_codes.user_description IS '個別ユーザー説明・用途（個別コードの場合のみ）';