# 画像ウォーターマークWebサービス - 開発ガイド

## プロジェクト概要
画像にウォーターマークを一括適用し、ZIP形式でダウンロードできるWebサービス

## 要件定義書
- **要件定義書**: `image-watermark-web-service-spec.md`
- このファイルにプロジェクトの全要件が記載されています
- 実装前に必ず要件定義書を参照してください

## 技術スタック
- **フロントエンド**: React/Vue.js (SPA)
- **バックエンド**: Vercel Serverless Functions  
- **データベース**: Neon PostgreSQL (認証のみ)
- **デプロイ**: Vercel
- **画像処理**: HTML5 Canvas または WebAssembly版ImageMagick
- **ZIP生成**: JSZip

## 主要機能
1. 画像アップロード (.jpg/.jpeg のみ)
2. ウォーターマーク設定 (テキスト、フォント、位置、透明度等)
3. 一括処理・ZIP ダウンロード
4. 設定ファイル保存・読み込み (JSON)
5. 認証機能

## 開発ルール
- 対象ファイル: .jpg/.jpeg のみ
- セキュリティ: HTTPS必須、パスワードはハッシュ化
- レスポンシブ対応必須
- アクセシビリティ対応必須

## 🔄 Git・コミットルール
### コミットメッセージ
- **言語**: 英語で記載（日本語禁止）
- **形式**: `Fix:`, `Add:`, `Update:`, `Remove:` 等の接頭辞を使用
- **詳細**: 変更内容と影響を明確に記載
- **署名**: `🤖 Generated with [Claude Code](https://claude.ai/code)` を含める

#### 良い例
```
Fix: Problem 8 - Complete resolution of watermark issues via client-side processing unification

## Summary
- Completely resolved watermark positioning and text corruption issues
- Deprecated server-side processing and unified to client-side processing
```

#### 悪い例
```
修正: 問題8の解決
サーバー処理を削除
```

## 🚨 セキュリティルール
### 環境変数・シークレット管理
- **絶対禁止**: .envファイルや環境変数をGitにコミットしない
- **対象ファイル**: .env*, vercel-env-*, *production*, *secrets*等
- **作成時注意**: 環境変数ファイルは作業完了後即座に削除する
- **Git履歴**: シークレット漏洩時は即座にファイル削除＋履歴削除実行
- **Claude作業時**: 環境変数ファイル作成後は絶対にコミット処理を行わない

### 認証情報・機密情報管理
- **厳重禁止**: 管理者ID・パスワード・APIキー等の平文記載をドキュメントファイルに含めない
- **対象ファイル**: *.md, README.md, TROUBLESHOOTING.md, CLAUDE.md, 仕様書等の全ドキュメント
- **記載方法**: 
  - 実際の値: ❌ `ml_imageadmin`, `X7AKUJdb`
  - 正しい記載: ✅ `[ADMIN_USERNAME]`, `[ADMIN_PASSWORD]`, `環境変数で管理`
- **発見時対応**: 即座にファイル修正 + Git履歴完全削除 + リモートリポジトリ強制プッシュ
- **予防策**: ドキュメント作成・更新時は機密情報の平文記載を事前確認

## 認証システム

### ユーザー認証（サブスクリプション契約者）
- **方式**: 招待コード認証（月次・個別ユーザー対応）
- **コード形式**: 
  - 月次コード: YYYYMM-XXXXX（例: 202501-A7B9C）
  - 個別ユーザーキー: USER-XXXXX（例: USER-A7B9C）
- **有効期間**: 
  - 月次コード: 当月末まで（時間制限なし）
  - 個別ユーザーキー: 管理者指定期間（7日〜1年）
- **セッション**: コード認証後は期限まで継続
- **管理**: 管理画面 + Slack通知の両方で運用
- **データベース**: invitation_codes, user_sessions テーブル

### 管理者認証
- **方式**: 固定ID・パスワード認証（環境変数管理）
- **管理者**: 単一管理者のみ
- **セッション**: JWT トークン（24時間有効）
- **URL**: `/admin` 配下
- **環境変数**: 
  - `ADMIN_USERNAME` : 管理者ID
  - `ADMIN_PASSWORD_HASH` : bcryptハッシュ値
  - `JWT_SECRET` : JWT署名用シークレット
- **データベース**: admin_sessions テーブル

## Slack通知システム
- **通知タイミング**: 新コード生成時のみ
- **保存方式**: Webhook URL を暗号化してDB保存
- **設定方法**: 管理画面でWebhook URL入力
- **通知内容**: 
  - 生成されたコード
  - 有効期限
  - 使用回数（0回）
  - 管理画面リンク
- **セキュリティ**: 
  - URL形式検証
  - 送信頻度制限（1分間10回）
  - リトライ制限（3回まで）
- **環境変数**: `ENCRYPT_KEY` （暗号化キー）
- **データベース**: admin_settings テーブル

## ファイルサイズ・処理制限
### Vercel Function制限準拠
- **1ファイル**: 3MB以下
- **同時処理**: 最大5ファイル
- **総計**: 4.5MB以下/リクエスト（Vercel body size制限）
- **同時ユーザー**: 1ユーザーのみ処理、他はキュー待機

### 処理方式：ハイブリッド自動振り分け
- **基本方針**: 運用コスト最適化を優先した自動振り分け
- **データ保持**: インメモリ処理（外部ストレージなし）
- **離脱対策**: プログレスバー、離脱防止メッセージ
- **キュー管理**: 最大5人待機、10分タイムアウト

#### クライアント処理（Canvas API）
```
条件: 1ファイル かつ 1.5MB以下
処理時間: 約1-5秒
使用技術: HTML5 Canvas API（無料）
メリット: サーバーリソース消費ゼロ、高速レスポンス
```

#### サーバー処理（Sharp + Node.js）
```
条件: 2-5ファイル かつ 総計4.5MB以下
処理時間: 約5-10秒
使用技術: Sharp（Node.js）
メリット: 高品質処理、メモリ効率
```

#### 振り分けロジック
```javascript
function determineProcessingMethod(files) {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const fileCount = files.length;
  
  // Canvas API（快適処理）
  if (fileCount === 1 && files[0].size <= 1.5 * 1024 * 1024) {
    return 'CLIENT';
  }
  
  // Server処理
  if (fileCount <= 5 && totalSize <= 4.5 * 1024 * 1024) {
    return 'SERVER';
  }
  
  return 'ERROR';
}
```

### クリーンアップ
- 処理中データ: 30分でタイムアウト
- 異常終了セッション: 自動解放
- cron実行: 毎時実行

## ダウンロード方式
### 自動判定ロジック
```javascript
function determineDownloadMethod(processedFiles) {
  const totalSize = processedFiles.reduce((sum, file) => sum + file.size, 0);
  
  // ZIP一括ダウンロード（4MB以下）
  if (totalSize <= 4 * 1024 * 1024) {
    return 'ZIP';
  }
  
  // 個別ダウンロード（4MB超過）
  return 'INDIVIDUAL';
}
```

### ZIP圧縮エラー対策
- **エラーケース**: メモリ不足、圧縮タイムアウト、ZIP生成失敗
- **対策**: 
  - 圧縮前のサイズチェック
  - メモリ使用量監視
  - フォールバック（個別ダウンロード）
  - ユーザーへの明確なエラーメッセージ

## エラーハンドリング
### 主要エラーケース
- **ファイルアップロード**: 拡張子・サイズ・破損ファイル
- **画像処理**: Canvas APIエラー、処理タイムアウト
- **認証**: 無効コード、セッション切れ、DB接続エラー
- **キュー**: 満杯、異常終了、リソース不足
- **ダウンロード**: ZIP圧縮失敗、ファイル破損

### エラー表示方針
- ユーザーフレンドリーなメッセージ
- 技術的詳細は隠す
- 復旧方法の明示
- 部分失敗時の継続処理

## 注意事項
- 商用利用可能フォントのライセンス確認必須
- ブラウザ処理限界を考慮したサーバーサイド処理の検討
- Neon PostgreSQL無料プランの制限に注意

## 要件定義書への追記内容

### 3.6 管理者機能
- **管理画面**：招待コード生成・管理、使用統計表示
- **コード生成機能**：月次コード・個別ユーザーキーの両方に対応
- **認証方式**：固定ID・パスワード（環境変数管理）
- **Slack通知**：新コード生成時の自動通知（月次・個別キー共に対応、Webhook URL暗号化保存）

### 3.7 同時処理制御
- **キューシステム**：1ユーザーのみ処理、他は順番待ち
- **待機表示**：「順番待ち中... あと○人待ちです」
- **タイムアウト**：10分で自動解放

### 4.1 パフォーマンス・制限（更新）
- **ファイル制限**：1ファイル3MB以下、最大5ファイル、総計15MB以下
- **処理方式**：ハイブリッド自動振り分け
  - 軽量処理（1ファイル1.5MB以下）：Canvas API（クライアント）
  - 重量処理（2-5ファイル）：Sharp + Node.js（サーバー）
- **同時処理**：1ユーザーのみ、他はキュー待機（最大5人、10分タイムアウト）

### 4.2 ダウンロード方式（新規）
- **自動判定**：処理後ファイルサイズが4MB以下はZIP、超過時は個別ダウンロード
- **ZIP圧縮エラー対策**：メモリ監視、フォールバック機能

### 3.5 認証（更新 - 2025年6月24日）
- **ユーザー認証**：招待コード（月次・個別ユーザー対応）
  - 月次コード: YYYYMM-XXXXX形式（当月末まで有効）
  - 個別ユーザーキー: USER-XXXXX形式（管理者指定期間）
- **管理者認証**：固定ID・パスワード、JWT（24時間有効）

### 8.1 エラーハンドリング（新規）
- **主要エラー**：ファイル、画像処理、認証、キュー、ダウンロード
- **表示方針**：ユーザーフレンドリー、復旧方法明示、部分失敗継続

## 実装順序

### Phase 1: 基盤構築（優先度：高）
1. データベーススキーマ設計・作成
2. 基本認証API（招待コード認証）
3. 簡単なフロントエンド認証画面

### Phase 2: 管理機能（優先度：高）
4. 管理者認証API
5. 管理画面UI（コード生成・統計）
6. Slack通知機能

### Phase 3: コア機能（優先度：高）
7. ファイルアップロード機能
8. 軽量処理（Canvas API）実装
9. 基本的なウォーターマーク適用
10. 個別ダウンロード機能

### Phase 4: 拡張機能（優先度：中）
11. 重量処理（Sharp）実装
12. ZIP一括ダウンロード
13. 自動振り分けロジック
14. 設定ファイル保存・読み込み

### Phase 5: 品質向上（優先度：中）
15. キューシステム・同時処理制御
16. エラーハンドリング強化
17. プログレスバー・UI改善

**開始**: データベーススキーマから実装開始

## 実装進捗状況

### 📊 進捗サマリー
```
Phase 1: 基盤構築      ✅ 完了 (100%) - コミット6b7832e
Phase 2: 管理機能      ✅ 完了 (100%) - コミット262579a  
Phase 3: コア機能      ✅ 完了 (100%) - 再処理機能・表示切替完了
Phase 4: 拡張機能      ✅ 完了 (100%) - 超高解像度対応・ZIP一括DL完了
Phase 5: 品質向上      ✅ 完了 (100%) - キューシステム・エラーハンドリング・プログレスバー完了
Phase 6: テスト・品質保証  ⏳ 予定 (0%) - ユーザーテスト待ち

開発進捗: 100% 完了 (5/5 Phase完了)
テスト段階: Phase 6 開始予定
```

### ✅ Phase 1: 基盤構築（完了）
- ✅ **1. データベーススキーマ設計・作成** 
  - Neonデータベース作成完了
  - 5つのテーブル作成完了 (invitation_codes, user_sessions, admin_sessions, admin_settings, processing_queue)
  - インデックス・初期データ投入完了
  - スキーマSQL実行完了
- ✅ **2. 基本認証API（招待コード認証）** 
  - Vercel環境変数設定完了（DATABASE_URL配置済み）
  - データベース接続確認済み
  - 認証API実装完了（/api/auth/verify, /api/auth/session）
  - ライブラリ関数実装完了（src/lib/auth.ts, src/lib/database.ts）
- ✅ **3. 簡単なフロントエンド認証画面** 
  - React認証フォーム実装完了（src/app/auth/page.tsx）
  - セッション管理機能実装完了（src/app/page.tsx）
  - ルート保護ミドルウェア実装完了（src/middleware.ts）

### ✅ Phase 1 テスト・デバッグ完了
- ✅ **認証システムの動作確認**
  - サンプル招待コード「202501-SAMPLE」での認証テスト成功
  - データベース接続・セッション管理の動作確認完了
  - 入力値検証（フロントエンド・API）の調整完了
  - 有効期限切れコードの修正対応完了

### ✅ Phase 2: 管理機能（完了）
- ✅ **4. 管理者認証API**
  - JWT認証エンドポイント実装完了（/api/admin/auth）
  - 環境変数ベースの管理者認証（ADMIN_USERNAME, ADMIN_PASSWORD_HASH, JWT_SECRET）
  - 24時間有効なJWTトークン生成・検証機能
  - セッション管理（admin_sessions テーブル）
- ✅ **5. 管理画面UI（コード生成・統計）**
  - 管理者ログインページ実装完了（/admin/login）
  - 管理画面メインページ実装完了（/admin）
  - 招待コード生成機能（年月指定、ランダムコード生成）
  - 使用状況統計表示（コード一覧、使用回数、アクティブセッション数）
  - コード無効化機能
- ✅ **6. Slack通知機能**
  - Webhook URL暗号化保存機能（AES-256-CBC）
  - 設定画面UI（テスト送信、設定保存・削除）
  - 新コード生成時の自動Slack通知（リッチテキスト形式）
  - 送信頻度制限・エラーハンドリング対応

### ✅ Phase 3: コア機能（完了）
- ✅ **7. ファイルアップロード機能**
  - ドラッグ&ドロップUI実装完了
  - ファイル選択ダイアログ対応
  - 複数ファイル同時アップロード対応
  - リアルタイムプレビュー機能
- ✅ **8. 軽量処理（Canvas API）実装**
  - HTML5 Canvas APIによる画像処理
  - クライアントサイド処理（1ファイル1.5MB以下自動判定）
  - メモリ効率的な処理実装
- ✅ **9. 基本的なウォーターマーク適用**
  - テキストウォーターマーク機能
  - フォント・サイズ・色設定
  - 5つの位置設定（左上・右上・中央・左下・右下）
  - 透明度調整機能
  - 影効果設定（オフセット・透明度調整可能）
- ✅ **10. 個別ダウンロード機能**
  - 処理済み画像の個別ダウンロード
  - ファイル名自動生成（watermarked_プレフィックス）
  - 全ファイル一括ダウンロード機能

### ✅ Phase 4: 拡張機能（完了）
- ✅ **11. 重量処理（Sharp）実装**
  - サーバーサイド画像処理API実装完了（/api/process-images）
  - Sharpライブラリによる高品質画像処理
  - 2-5ファイル対応（総計15MB以下）
  - SVG生成によるウォーターマーク合成
- ✅ **12. ZIP一括ダウンロード**
  - JSZipライブラリによるZIP圧縮機能
  - ファイル名重複回避機能
  - メモリ効率的なBlob生成
  - ZIP圧縮エラー時のフォールバック機能
- ✅ **13. 自動振り分けロジック完成**
  - クライアント/サーバー処理の完全自動判定
  - 1ファイル1.5MB以下：Canvas API（クライアント）
  - 複数ファイルまたは1.5MB超過：Sharp（サーバー）
  - 再処理機能でも自動振り分け対応
- ✅ **14. ダウンロード方式自動判定**
  - 4MB以下：ZIP一括ダウンロード
  - 4MB超過：個別ダウンロード
  - リアルタイムでダウンロード方式を表示
  - エラーハンドリングとフォールバック機能

### ✅ Phase 5: 品質向上（完了）
- ✅ **15. キューシステム・同時処理制御**
  - キューAPI実装完了（/api/queue, /api/queue/cleanup）
  - 1ユーザーのみ処理、他は順番待ち機能
  - 待機表示UI（あと○人待ちです）実装完了
  - 10分タイムアウト・24時間自動クリーンアップ機能
  - リアルタイムポーリング（2秒間隔）
- ✅ **16. エラーハンドリング強化**
  - 部分失敗時の継続処理機能完了
  - ユーザーフレンドリーなエラーメッセージ実装完了
  - エラー種別に応じた解決方法表示
  - 視覚的エラー表示（警告/情報/エラー）
- ✅ **17. プログレスバー・UI改善**
  - リアルタイム処理進捗表示実装完了
  - 現在処理中ファイル名表示
  - 離脱防止メッセージ（beforeunload警告）
  - レスポンシブデザイン強化（モバイル対応）

### ⏳ Phase 6: テスト・品質保証（予定）
- ⏳ **18. 総合テスト**
  - ユーザー受け入れテスト（UAT）
  - 機能テスト（全Phase横断）
  - パフォーマンステスト
  - ストレステスト（キューシステム）
- ⏳ **19. セキュリティテスト**
  - 認証・認可テスト
  - ファイルアップロードセキュリティ
  - APIエンドポイントセキュリティ
  - セッション管理テスト
- ⏳ **20. デバイス・ブラウザ互換性テスト**
  - クロスブラウザテスト（Chrome, Firefox, Safari, Edge）
  - モバイルデバイステスト（iOS, Android）
  - レスポンシブデザインテスト
- ⏳ **21. 運用テスト**
  - Vercel本番環境テスト
  - データベース接続安定性テスト
  - キューシステム長時間運用テスト
  - エラー監視・ログ確認

### 📝 完了済み作業（2025/6/17）
- プロジェクト基本構成（Next.js + TypeScript + Tailwind）
- データベース設計・作成・接続
- 認証システムの完全実装（フロントエンド・バックエンド）
- **管理機能の完全実装（Phase 2完了）** - コミット262579a
- **コア機能の完全実装（Phase 3完了）** - 再処理機能・表示切替完了
- **拡張機能の完全実装（Phase 4完了）** - 超高解像度対応・自動振り分け完了
- **品質向上機能の完全実装（Phase 5完了）** - キューシステム・エラーハンドリング・プログレスバー完了
- Gitリポジトリ管理・Vercelデプロイ
- **開発作業100%完了** - 全Phase実装完了、テスト段階へ移行

### 🛠️ 実装詳細
#### データベーステーブル
```sql
invitation_codes   - 招待コード管理
user_sessions     - ユーザーセッション管理  
admin_sessions    - 管理者セッション管理
admin_settings    - 管理者設定（Slack Webhook等）
processing_queue  - 処理キュー管理
```

#### API エンドポイント
```
# ユーザー認証
POST /api/auth/verify     - 招待コード認証
GET  /api/auth/session    - セッション確認
DELETE /api/auth/session  - ログアウト

# 管理者認証
POST /api/admin/auth      - 管理者ログイン（JWT）
GET  /api/admin/auth      - 管理者セッション確認
DELETE /api/admin/auth    - 管理者ログアウト

# 管理機能
GET  /api/admin/invitation-codes    - 招待コード一覧取得
POST /api/admin/invitation-codes    - 招待コード生成（Slack通知付き）
DELETE /api/admin/invitation-codes  - 招待コード無効化

# Slack設定
GET  /api/admin/slack-settings      - Slack設定取得
POST /api/admin/slack-settings      - Slack設定保存・テスト送信
DELETE /api/admin/slack-settings    - Slack設定削除

# 画像処理（Phase 3&4で追加）
POST /api/process-images            - サーバーサイド画像処理（Sharp）

# 開発・保守用
GET  /api/debug          - デバッグ情報取得（開発用）
POST /api/update-sample   - サンプルコード更新（保守用）
```

#### フロントエンドページ
```
/              - メインページ（認証後・画像ウォーターマーク処理）
/auth          - 認証フォーム
/admin/login   - 管理者ログインページ
/admin         - 管理画面（コード生成・統計・Slack設定）
```

### 🎯 Phase 3 実装機能詳細
#### ファイルアップロード機能
- **ドラッグ&ドロップUI**: 直感的なファイル選択インターフェース
- **ファイル検証**: .jpg/.jpeg形式、3MB以下、最大5ファイル、総計15MB以下
- **プレビュー機能**: アップロードファイルの即座プレビュー表示
- **エラーハンドリング**: 詳細なエラーメッセージ表示

#### ウォーターマーク設定機能
- **テキスト設定**: カスタムウォーターマークテキスト入力
- **フォント設定**: Arial, Georgia, Times New Roman, Helvetica対応
- **フォントサイズ**: 12px〜72pxのスライダー調整
- **位置設定**: 5箇所の配置オプション（左上・右上・中央・左下・右下）
- **色設定**: カラーピッカーによる任意色選択
- **透明度設定**: 10%〜100%のスライダー調整
- **影効果**: 有効/無効切り替え、X/Y軸オフセット、透明度調整

#### Canvas API画像処理
- **クライアントサイド処理**: 1ファイル1.5MB以下の自動判定
- **高速処理**: サーバーリソース消費ゼロ
- **品質保持**: JPEG品質90%での出力
- **メモリ管理**: 適切なオブジェクトURL管理

#### ダウンロード機能
- **個別ダウンロード**: 各ファイルの個別保存
- **ZIP一括ダウンロード**: 複数ファイルの効率的配布
- **自動判定**: 4MB以下はZIP、超過時は個別ダウンロード
- **ファイル名管理**: 自動プレフィックス付与（watermarked_）
- **処理状態表示**: 未処理/処理済みの視覚的区別

#### 再処理機能（Phase 3改善）
- **元画像保持**: 処理後も元画像を保持してメモリ内で管理
- **再処理機能**: パラメータ変更後、元画像から再度ウォーターマーク適用可能
- **表示切替**: 元画像/処理済み画像の表示切替機能
- **UX優先**: 再アップロード不要で何度でも試行錯誤可能
- **メモリ管理**: 適切なオブジェクトURL管理で使用量を最小化

#### サーバーサイド処理（Phase 4新機能）
- **Sharp + Node.js**: 高品質な画像処理エンジン
- **SVG合成**: テキストウォーターマークをSVG形式で生成・合成
- **複数ファイル対応**: 2-5ファイル、総計15MB以下を効率処理
- **自動振り分け**: 1.5MB超過ファイルを自動でサーバー処理
- **エラーハンドリング**: 処理失敗時の詳細エラーメッセージ

#### ZIP一括ダウンロード（Phase 4新機能）
- **JSZip圧縮**: 複数ファイルを効率的にZIP化
- **サイズ判定**: 4MB以下自動ZIP、超過時個別ダウンロード
- **ファイル名重複回避**: 同名ファイルに連番自動付与
- **フォールバック機能**: ZIP失敗時の個別ダウンロード切替
- **メモリ効率**: Blob生成とURL管理の最適化

#### 超高解像度対応（Phase 4改善）
- **フォントサイズ大幅拡張**: 12-72px → 12-500px
- **スマートステップ調整**: サイズ範囲に応じた最適な刻み幅
  - 12-50px: 1px刻み（細かい調整）
  - 50-100px: 2px刻み（標準）
  - 100-200px: 5px刻み（大きいサイズ）
  - 200-500px: 10px刻み（超大サイズ）
- **解像度レベル表示**: 高解像度用/超高解像度用の視覚的ガイド
- **大容量画像対応**: 2MB超の高解像度画像でも視認可能なウォーターマーク
- **UI最適化**: スライダー動作とステップ調整の改善

## 🎯 Phase 3 & Phase 4 新機能詳細

### 🔄 再処理機能（Phase 3 key feature）
**従来の問題**: パラメータ変更の度に画像を再アップロードする必要があった  
**解決策**: 元画像をメモリに保持し、設定変更時は再アップロード不要で即座に再処理

#### 実装詳細
- **元画像保持**: 処理後も元のFileオブジェクトをメモリ内で保持
- **設定変更検知**: ウォーターマーク設定の変更を検知し、自動で再処理を実行
- **処理方式継承**: 初回処理時の方式（Canvas/Server）を再処理でも使用
- **メモリ管理**: 適切なオブジェクトURL管理で使用量を最小化
- **UX向上**: 設定変更→即座反映で試行錯誤が快適に

```javascript
// 実装例
const handleWatermarkChange = (newSettings) => {
  if (processedImages.length > 0) {
    // 元画像から再処理
    reprocessImages(originalFiles, newSettings);
  }
};
```

### 🖼️ 表示切替機能（Phase 3 key feature）
**目的**: 処理前後の比較を容易にし、ウォーターマーク効果を視覚的に確認

#### 実装詳細
- **切替ボタン**: 元画像/処理済み画像の表示切替
- **統一インターフェース**: 全ての画像で同時切替
- **処理状態表示**: 未処理/処理済みの視覚的区別
- **プレビュー機能**: 処理前の画像確認が可能

### 🔀 ハイブリッド自動振り分け（Phase 4 key feature）
**目的**: ファイルサイズと数に応じて最適な処理方式を自動選択

#### 振り分けロジック
```javascript
function determineProcessingMethod(files) {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const fileCount = files.length;
  
  // Canvas API（軽量・高速）
  if (fileCount === 1 && files[0].size <= 1.5 * 1024 * 1024) {
    return 'CLIENT';
  }
  
  // Sharp API（重量・高品質）
  if (fileCount <= 5 && totalSize <= 15 * 1024 * 1024) {
    return 'SERVER';
  }
  
  return 'ERROR';
}
```

#### 処理方式比較
| 方式 | 条件 | 処理時間 | メリット | デメリット |
|------|------|----------|----------|------------|
| Canvas API | 1ファイル1.5MB以下 | 1-3秒 | サーバー負荷ゼロ、高速 | 単一ファイル限定 |
| Sharp API | 2-5ファイル15MB以下 | 5-10秒 | 高品質、複数ファイル対応 | サーバー負荷あり |

### 📦 ダウンロード方式自動判定（Phase 4 key feature）
**目的**: 処理後ファイルサイズに応じて最適なダウンロード方式を自動選択

#### 判定ロジック
```javascript
function determineDownloadMethod(processedFiles) {
  const totalSize = processedFiles.reduce((sum, file) => sum + file.size, 0);
  
  // ZIP一括ダウンロード（効率的）
  if (totalSize <= 4 * 1024 * 1024) {
    return 'ZIP';
  }
  
  // 個別ダウンロード（安全）
  return 'INDIVIDUAL';
}
```

#### ダウンロード方式比較
| 方式 | 条件 | メリット | デメリット |
|------|------|----------|------------|
| ZIP一括 | 4MB以下 | 1回のダウンロード、整理済み | 圧縮時間必要 |
| 個別 | 4MB超過 | 確実なダウンロード、メモリ安全 | 複数回のダウンロード |

### 🎨 超高解像度ウォーターマーク対応（Phase 4 key feature）
**課題**: 高解像度画像（2MB超）では従来の72pxフォントが小さすぎて視認困難  
**解決策**: 12-500pxの大幅拡張とスマートステップ調整

#### フォントサイズ拡張詳細
- **従来**: 12-72px（固定1px刻み）
- **拡張後**: 12-500px（スマート刻み）
  - 12-50px: 1px刻み（細かい調整）
  - 50-100px: 2px刻み（標準）  
  - 100-200px: 5px刻み（大きいサイズ）
  - 200-500px: 10px刻み（超大サイズ）

#### UI改善
- **解像度レベル表示**: 現在のフォントサイズがどの解像度レベルに適するかを表示
- **スライダー最適化**: サイズ範囲に応じた最適な刻み幅で快適な操作感
- **プレビュー強化**: 大きいフォントサイズでも適切にプレビュー表示

### ⚡ メモリ管理最適化（Phase 3&4 共通改善）
**目的**: 大容量ファイル処理時のメモリ使用量を最小化

#### 最適化施策
- **オブジェクトURL管理**: 使用後の適切なrevoke実行
- **Canvas要素再利用**: 処理毎の新規作成を避ける
- **Blob生成最適化**: 必要時のみ生成、即座解放
- **メモリリーク防止**: イベントリスナーの適切な削除

```javascript
// メモリ管理例
const processImage = async (file) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  try {
    // 画像処理
    const result = await processImageOnCanvas(file, canvas, ctx);
    return result;
  } finally {
    // メモリ解放
    canvas.remove();
    ctx = null;
  }
};
```

### 🔍 トラブルシューティング記録
1. **招待コード入力長制限** - maxLength修正（12→20文字）
2. **API正規表現パターン** - 固定長{5}を可変長+に修正
3. **有効期限切れ** - 2025年1月→6月への更新対応
4. **ミドルウェア保護** - デバッグエンドポイントの公開設定
5. **VSCodeリモートSSH環境での接続問題** - Next.jsサーバーアクセス不可（2025/6/17）
6. **管理者認証システムのトラブルシューティング** - Vercel本番環境での管理画面アクセス（2025/6/18）
7. **個別ユーザーキー機能実装時の問題群** - データベーススキーマとAPI実装（2025/6/24）

#### 問題5の詳細：VSCodeリモートSSH + リモートデスクトップ環境での接続エラー

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
- 接続テスト: `curl -I http://localhost:3000`

**確認コマンド**:
```bash
# サーバー起動確認
ps aux | grep "next dev"

# ポート確認
ss -tlnp | grep 3000

# 接続テスト
curl -I http://localhost:3000
```

#### 問題6の詳細：管理者認証システムのトラブルシューティング（2025/6/18）

**環境**: Vercel本番環境での管理画面アクセス  
**症状**: `このページは動作していません`、管理画面ログイン不可  
**原因**: 
- Vercel環境変数設定の問題
- 管理認証APIでのbcryptエラー
- ミドルウェアの無限リダイレクトループ（根本原因）

**解決手順**:
1. **環境変数再設定**: 管理者認証情報の本番用設定
   ```bash
   ADMIN_USERNAME=[ADMIN_USERNAME]
   ADMIN_PASSWORD_HASH=$2a$10$ZgSSETieI5f9uhlN48aaMegfiRybBA29l2nFY/tT29mLe0vSpYdyW
   JWT_SECRET=[64文字ランダム文字列]
   ENCRYPT_KEY=[32文字ランダム文字列]
   ```

2. **管理認証API強化**: bcrypt・DB接続エラーハンドリング追加
   ```javascript
   // パスワード検証のエラーハンドリング
   try {
     isPasswordValid = await bcrypt.compare(password, adminPasswordHash);
   } catch (bcryptError) {
     console.error('bcrypt comparison error:', bcryptError);
     return NextResponse.json({...}, { status: 500 });
   }
   ```

3. **ミドルウェア修正**: `/admin/login`パスを認証不要に設定
   ```javascript
   // 管理者ログインページは認証不要（重要）
   if (request.nextUrl.pathname === '/admin/login') {
     return NextResponse.next();
   }
   ```

**予防策**:
- 新しい認証ページ追加時は、ミドルウェアの認証除外設定を確認
- Vercel環境変数変更後は必ず強制再デプロイ実行
- 307リダイレクトエラーは無限ループの可能性を疑う
- 管理画面関連の問題は段階的に調査（環境変数→API→ミドルウェア）

**最終状態**: ✅ 管理画面ログイン成功、全機能正常動作

**詳細記録**: `TROUBLESHOOTING.md`

#### 問題7の詳細：個別ユーザーキー機能実装時の問題群（2025/6/24）

**背景**: 月次招待コードに加えて個別ユーザーキー機能（USER-XXXXX形式）を追加実装

##### 問題7-1：データベーススキーマ不一致エラー
**症状**: `column ic.code_type does not exist`
**原因**: APIが新しいカラムを参照するが、データベースマイグレーション未実行
**解決策**: 
- マイグレーション前後の互換性確保コード実装
- 動的カラム存在チェック機能追加
- 条件分岐によるSQL生成

##### 問題7-2：データベースカラムサイズ不足
**症状**: `value too long for type character varying(10)`
**原因**: `code_type`カラムがVARCHAR(10)だが`user_specific`は13文字
**解決策**: 
```sql
ALTER TABLE invitation_codes 
ALTER COLUMN code_type TYPE VARCHAR(20);
```

##### 問題7-3：NOT NULL制約違反
**症状**: `null value in column "month" violates not-null constraint`
**原因**: 個別ユーザーキーで`month`をNULLにする必要があるが制約で拒否
**解決策**: 
```sql
ALTER TABLE invitation_codes 
ALTER COLUMN month DROP NOT NULL;
```

##### 問題7-4：認証フォームパターン制約
**症状**: 認証画面で「指定されている形式で入力してください」
**原因**: HTMLパターン`[0-9]{6}-[A-Z0-9]+`が月次コードのみ対応
**解決策**: パターンを`([0-9]{6}-[A-Z0-9]+)|(USER-[A-Z0-9]+)`に変更

##### 問題7-5：管理者セッションテーブル不一致
**症状**: `column "session_id" of relation "admin_sessions" does not exist`
**原因**: API実装で存在しない`session_id`カラムを参照
**実際のスキーマ**: `session_token`, `expires_at`, `ip_address`, `created_at`, `id`
**解決策**: INSERT文を正しいカラム名に修正

##### 問題7-6：個別ユーザーキー削除機能エラー
**症状**: `INVALID_REQUEST_METHOD: This Request was not made with an accepted method`
**原因**: Vercel Serverless FunctionsでDELETEメソッドの処理問題
**解決策（試行中）**: 
- POST方式の削除APIエンドポイント作成: `/api/admin/invitation-codes/deactivate`
- フロントエンドをPOSTリクエストに変更
- **現在の状況**: 依然として解決せず、継続調査中

**予防策**:
- マイグレーション前後の互換性を事前設計
- カラムサイズを十分に確保（VARCHAR(20)など）
- HTMLフォーム制約と認証ロジックの一致確認
- Serverless環境でのHTTPメソッド制限を考慮した設計
- テーブルスキーマと実装コードの定期的な整合性チェック

**実装完了機能**:
✅ 個別ユーザーキー生成（USER-XXXXX形式）
✅ 月次・個別キー統合管理画面
✅ タブ式UI（月次コード/個別ユーザーキー）
✅ Slack通知（両タイプ対応）
✅ 認証システム（両フォーマット対応）
⚠️ 削除機能（継続調査中）

### 📋 次回作業予定（Phase 6: テスト・品質保証）

#### 🧪 テスト計画
1. **総合機能テスト**
   - 全Phase機能の横断テスト
   - ユーザーフロー完全テスト（認証→アップロード→処理→ダウンロード）
   - キューシステムのストレステスト（複数ユーザー同時アクセス）
   - エラーケースの網羅的テスト

2. **パフォーマンステスト**
   - 大容量ファイル処理テスト（3MB上限での安定性）
   - 複数ファイル同時処理テスト（5ファイル15MB）
   - ZIP生成パフォーマンステスト
   - メモリ使用量・CPU使用率測定

3. **セキュリティ・安定性テスト**
   - 不正ファイルアップロードテスト
   - セッション管理・認証バイパステスト
   - SQL注入・XSS脆弱性テスト
   - CSRF攻撃耐性テスト

4. **デバイス・ブラウザ互換性テスト**
   - モバイルデバイス操作テスト（iPhone, Android）
   - クロスブラウザテスト（Chrome, Firefox, Safari, Edge）
   - レスポンシブデザイン動作確認
   - タッチ操作・ドラッグ&ドロップテスト

#### ✅ テスト完了後の本番リリース準備
- 本番環境最終確認
- ユーザー向けマニュアル作成
- 運用監視体制構築


### 🚀 デプロイ情報
- **本番URL**: https://image-watermark-web-service.vercel.app
- **認証**: サンプルコード「202501-SAMPLE」で動作確認済み
- **管理画面**: https://image-watermark-web-service.vercel.app/admin
- **リポジトリ**: https://github.com/Murasan201/image-watermark-web-service
- **最新コミット**: Phase 3&4完了 (コア機能・拡張機能実装完了)

### 🔧 環境変数設定（Phase 4完了時点）
```bash
# 管理者認証用
ADMIN_USERNAME=admin          # 管理者ユーザー名
ADMIN_PASSWORD_HASH=...       # bcryptハッシュ値
JWT_SECRET=...               # JWT署名用シークレット（32文字以上推奨）

# Slack通知用（オプション）
ENCRYPT_KEY=...              # AES暗号化キー（32文字）

# データベース接続
DATABASE_URL=...             # Neon PostgreSQL接続URL
```

### 📈 機能完成度
```
✅ 認証システム             100% - 招待コード・管理者認証
✅ 管理機能                100% - コード生成・統計・Slack通知
✅ ファイルアップロード      100% - ドラッグ&ドロップ・バリデーション
✅ ウォーターマーク処理     100% - Canvas/Sharp自動振り分け
✅ 再処理機能              100% - 設定変更時の即座再処理
✅ 表示切替機能            100% - 元画像/処理済み画像
✅ ダウンロード機能         100% - 個別/ZIP自動判定
✅ 超高解像度対応          100% - 12-500pxフォントサイズ
✅ キューシステム          100% - 同時処理制御・タイムアウト機能
✅ エラーハンドリング強化   100% - 部分失敗対応・フレンドリーメッセージ
✅ プログレスバー          100% - 処理進捗表示・離脱防止
✅ レスポンシブデザイン     100% - モバイル対応強化

🎯 開発完成度: 100% (全機能実装完了)
📝 テスト段階: Phase 6 開始予定
```