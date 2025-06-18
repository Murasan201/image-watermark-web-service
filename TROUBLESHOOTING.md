# 画像ウォーターマークWebサービス - トラブルシューティング履歴

このファイルは、プロジェクトで発生した問題とその解決方法を記録しています。

---

## 問題1: 招待コード入力長制限エラー

**発生日**: 開発初期  
**対処日**: Phase 1完了時  
**症状**: 招待コード入力フィールドの文字数制限により正しいコードが入力できない  
**原因**: フロントエンドのmaxLength設定が12文字、実際のコード形式は「YYYYMM-XXXXX」で13文字  

**解決策**:
```javascript
// 修正前
<input maxLength={12} />

// 修正後  
<input maxLength={20} />
```

**予防策**: コード形式変更時はフロントエンドの入力制限も併せて確認

---

## 問題2: API正規表現パターンエラー

**発生日**: Phase 1開発中  
**対処日**: Phase 1完了時  
**症状**: 招待コードAPI検証で正しいコードが無効と判定される  
**原因**: 正規表現パターンが固定長{5}、実際には可変長が必要  

**解決策**:
```javascript
// 修正前
const pattern = /^\d{6}-[A-Z0-9]{5}$/

// 修正後
const pattern = /^\d{6}-[A-Z0-9]+$/
```

**予防策**: 正規表現テストの実装、コード形式仕様の明確化

---

## 問題3: 招待コード有効期限切れ

**発生日**: 2025年1月  
**対処日**: 継続対応中  
**症状**: サンプル招待コード「202501-SAMPLE」の有効期限が2025年1月末で切れる  
**原因**: 月次招待コードの自動更新機能未実装  

**解決策**: 
1. 手動更新エンドポイント実装（`/api/update-sample`）
2. 管理画面での招待コード生成機能
3. 有効期限の定期確認・更新

**予防策**: 有効期限監視・自動更新システムの検討

---

## 問題4: ミドルウェア保護設定

**発生日**: Phase 1開発中  
**対処日**: Phase 1完了時  
**症状**: デバッグエンドポイントがミドルウェアで保護されアクセス不可  
**原因**: `/api/debug`がpublicPathsに含まれていない  

**解決策**:
```javascript
const publicPaths = [
  '/auth', 
  '/api/auth/verify', 
  '/api/debug',  // 追加
  '/api/update-sample', 
  '/api/test-sharp'
];
```

**予防策**: 新規エンドポイント追加時はミドルウェア設定も同時に確認

---

## 問題5: VSCodeリモートSSH環境での接続問題

**発生日**: 2025年6月17日  
**対処日**: 2025年6月17日  
**環境**: VSCodeリモートSSH接続 + リモートデスクトップ  
**症状**: `このサイトにアクセスできません`、`Connection refused`  

**原因**: 
- Next.jsデフォルトバインド（127.0.0.1）では外部接続不可
- VSCodeポートフォワーディング未設定
- APIルートのエクスポートエラー（`getDecryptedWebhookUrl`）

**解決手順**:
1. **ビルドエラー修正**: Next.js APIルートの不正エクスポート削除
   ```bash
   # エラー例: "getDecryptedWebhookUrl" is not a valid Route export field
   # 解決: export → 内部関数に変更
   ```

2. **Next.jsバインド設定変更**: 
   ```json
   // package.json
   "dev": "next dev -H 0.0.0.0"  // 全インターフェースでバインド
   ```

3. **VSCodeポートフォワーディング設定**:
   - VSCode下部「ポート」タブ → 「ポートの追加」
   - ポート3000を追加、可視性を「Public」に設定

**予防策**:
- リモート開発時は必ず`-H 0.0.0.0`オプション使用
- VSCodeポートフォワーディングを事前設定
- `npm run build`で定期的にビルドエラーチェック

**確認コマンド**:
```bash
# サーバー起動確認
ps aux | grep "next dev"

# ポート確認
ss -tlnp | grep 3000

# 接続テスト
curl -I http://localhost:3000
```

---

## 問題6: 管理者認証システムのトラブルシューティング

**発生日**: 2025年6月18日  
**対処日**: 2025年6月18日  
**環境**: Vercel本番環境での管理画面アクセス  
**症状**: `このページは動作していません`、管理画面ログイン不可  

**原因**: 
- Vercel環境変数設定の問題
- 管理認証APIでのbcryptエラー
- ミドルウェアの無限リダイレクトループ（根本原因）

**解決手順**:

### Phase 1: 環境変数再設定
管理者認証情報の本番用設定
```bash
ADMIN_USERNAME=ml_imageadmin
ADMIN_PASSWORD_HASH=$2a$10$ZgSSETieI5f9uhlN48aaMegfiRybBA29l2nFY/tT29mLe0vSpYdyW
JWT_SECRET=[64文字ランダム文字列]
ENCRYPT_KEY=[32文字ランダム文字列]
```

### Phase 2: 管理認証API強化
bcrypt・DB接続エラーハンドリング追加
```javascript
// パスワード検証のエラーハンドリング
let isPasswordValid = false;
try {
  isPasswordValid = await bcrypt.compare(password, adminPasswordHash);
} catch (bcryptError) {
  console.error('bcrypt comparison error:', bcryptError);
  return NextResponse.json(
    { success: false, message: 'パスワード検証でエラーが発生しました' },
    { status: 500 }
  );
}

// データベース接続エラー対応
let sessionId;
try {
  const db = await getDb();
  sessionId = crypto.randomUUID();
  // ... DB処理
} catch (dbError) {
  console.error('Database session save error:', dbError);
  // データベースエラーでも認証は成功させる（セッション記録なしで）
  sessionId = crypto.randomUUID();
}
```

### Phase 3: ミドルウェア修正（根本解決）
`/admin/login`パスを認証不要に設定
```javascript
// 修正前（無限ループの原因）
if (isAdminPath || isAdminAuthPath) {
  if (isAdminAuthPath) {
    return NextResponse.next(); // /api/admin/auth のみ除外
  }
  
  // ここで /admin/login も管理画面として認証が必要と判断
  const adminToken = request.cookies.get('admin-token')?.value;
  
  if (!adminToken) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login'; // /admin/login -> /admin/login の無限ループ
    return NextResponse.redirect(url);
  }
}

// 修正後
if (isAdminPath || isAdminAuthPath) {
  // 管理者認証APIは認証不要
  if (isAdminAuthPath) {
    return NextResponse.next();
  }

  // 管理者ログインページは認証不要（重要）
  if (request.nextUrl.pathname === '/admin/login') {
    return NextResponse.next();
  }

  // 管理画面は管理者認証が必要
  const adminToken = request.cookies.get('admin-token')?.value;
  // ...
}
```

**最終状態**: ✅ 管理画面ログイン成功、全機能正常動作

**予防策**:
- 新しい認証ページ追加時は、ミドルウェアの認証除外設定を確認
- Vercel環境変数変更後は必ず強制再デプロイ実行
- 307リダイレクトエラーは無限ループの可能性を疑う
- 管理画面関連の問題は段階的に調査（環境変数→API→ミドルウェア）

**最終的な管理者認証情報**:
- **URL**: https://image-watermark-web-service.vercel.app/admin/login
- **管理者ID**: `ml_imageadmin`
- **パスワード**: `X7AKUJdb`

---

## トラブルシューティング時の調査手順

### 1. 基本確認
- Vercelログの確認（HTTPステータスコード）
- 環境変数の設定状況確認
- ローカル環境での再現確認

### 2. API問題の調査
```bash
# API直接テスト
curl -X POST "https://domain.com/api/endpoint" \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}' \
  -v

# 環境変数確認（デバッグ用エンドポイント）
curl https://domain.com/api/admin/env-check
```

### 3. ミドルウェア問題の調査
- リダイレクトループの確認（307エラー）
- パス設定の確認
- 認証除外設定の確認

### 4. データベース問題の調査
- 接続確認
- クエリのテスト
- タイムアウト設定の確認

---

## 連絡先・エスカレーション

**緊急時の対応**:
1. Vercelログの確認
2. 本ドキュメントでの類似問題検索
3. 段階的な問題切り分け実施

---

## 問題7: 管理画面の招待コード機能エラー

**発生日**: 2025年6月18日  
**対処日**: 2025年6月18日  
**環境**: Vercel本番環境、管理画面の招待コード機能  
**症状**: 
- 招待コード一覧で「招待コードの取得に失敗しました」表示
- 招待コード生成ボタンクリック時に「サーバーエラーが発生しました」表示

**エラーログ**:
```
Invitation code generation error: error: null value in column "month" of relation "invitation_codes" violates not-null constraint
Failing row contains (2, 202506-DT1N5, null, 2025-06-18 01:17:02.687249, 2025-06-30 23:59:59, 0, t).
```

**原因**: 
- データベーススキーマで`month`カラムがNOT NULL制約で定義されている
- INSERTクエリで`month`カラムに値を挿入していない
- カラム名の不整合（`usage_count` vs `used_count`、`code_used` vs `invitation_code`）

**解決手順**:

### 1. INSERTクエリの修正
monthカラムの値を含むように修正
```javascript
// 修正前
await db.query(
  `INSERT INTO invitation_codes (code, expires_at, created_at, is_active) 
   VALUES ($1, $2, NOW(), true)`,
  [invitationCode, expiresAt]
);

// 修正後
const monthValue = `${yearNum}-${monthNum.toString().padStart(2, '0')}`;
await db.query(
  `INSERT INTO invitation_codes (code, month, expires_at, created_at, is_active) 
   VALUES ($1, $2, $3, NOW(), true)`,
  [invitationCode, monthValue, expiresAt]
);
```

### 2. データベーススキーマとの整合性確保
カラム名をスキーマに合わせて統一
```javascript
// SELECTクエリの修正
// 修正前: ic.used_count
// 修正後: ic.usage_count

// JOINクエリの修正  
// 修正前: us.invitation_code
// 修正後: us.code_used

// 存在しないカラム参照の削除
// 修正前: us.expires_at > NOW()
// 修正後: 条件削除（user_sessionsテーブルにexpires_atカラムなし）
```

### 3. 完全なAPIクエリ修正
```sql
SELECT 
  ic.code,
  ic.expires_at,
  ic.created_at,
  ic.is_active,
  ic.usage_count,
  COUNT(us.session_id) as active_sessions
FROM invitation_codes ic
LEFT JOIN user_sessions us ON ic.code = us.code_used
GROUP BY ic.code, ic.expires_at, ic.created_at, ic.is_active, ic.usage_count
ORDER BY ic.created_at DESC
LIMIT 50
```

**最終状態**: ✅ 管理画面の招待コード機能が完全に動作
- 招待コード一覧の正常表示
- 招待コード生成の成功
- 招待コード無効化機能の動作確認

**予防策**:
- 新しいテーブル作成時は、スキーマとAPIの整合性を最初に確認
- NOT NULL制約のあるカラムは、INSERTクエリで必ず値を指定
- データベーススキーマドキュメントの定期的な更新
- APIとスキーマのカラム名命名規則を統一

**学習ポイント**:
- データベースエラーログの`Failing row contains`情報が問題特定に重要
- PostgreSQLのNOT NULL制約エラーは明確な原因を示す
- テーブル間のJOIN時は両テーブルのカラム存在を確認する

---

**記録の更新**:
新しい問題が発生した場合は、このファイルに解決方法を追記してください。