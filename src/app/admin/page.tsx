'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import UsageStatistics from '@/components/UsageStatistics';

interface InvitationCode {
  code: string;
  codeType: 'monthly' | 'user_specific';
  month?: string;
  userName?: string;
  userDescription?: string;
  expiresAt: string;
  createdAt: string;
  isActive: boolean;
  usedCount: number;
  activeSessions: number;
}

interface SlackSettings {
  configured: boolean;
  isValid?: boolean;
  updatedAt?: string;
  maskedUrl?: string;
}

export default function AdminPage() {
  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 招待コード関連のメッセージ状態
  const [codesError, setCodesError] = useState('');
  const [codesSuccess, setCodesSuccess] = useState('');
  
  // デバッグ情報状態
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  // Slack設定関連のメッセージ状態
  const [slackError, setSlackError] = useState('');
  const [slackSuccess, setSlackSuccess] = useState('');
  
  const [generateForm, setGenerateForm] = useState({
    year: new Date().getFullYear().toString(),
    month: (new Date().getMonth() + 1).toString()
  });
  
  // 個別ユーザーキー生成フォーム
  const [userKeyForm, setUserKeyForm] = useState({
    userName: '',
    userDescription: '',
    expirationDays: '30'
  });
  const [isGeneratingUserKey, setIsGeneratingUserKey] = useState(false);
  const [activeTab, setActiveTab] = useState<'monthly' | 'user_specific' | 'statistics'>('monthly');
  const [migrationStatus, setMigrationStatus] = useState<'unknown' | 'completed' | 'pending'>('unknown');
  const [slackSettings, setSlackSettings] = useState<SlackSettings>({ configured: false });
  const [slackForm, setSlackForm] = useState({
    webhookUrl: '',
    isLoading: false,
    isTesting: false
  });
  const router = useRouter();

  // ページロード時に招待コード一覧とSlack設定を取得
  useEffect(() => {
    fetchCodes();
    fetchSlackSettings();
  }, []);

  const fetchCodes = async () => {
    try {
      console.log('🔍 Fetching invitation codes...');
      const response = await fetch('/api/admin/invitation-codes');
      
      // デバッグ情報を収集
      const debugData: any = {
        url: '/api/admin/invitation-codes',
        method: 'GET',
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        timestamp: new Date().toISOString()
      };
      
      console.log('🔍 API Response:', debugData);
      
      const data = await response.json();
      debugData.responseBody = data;
      setDebugInfo(debugData);

      if (data.success) {
        setCodes(data.codes);
        setCodesError(''); // エラーをクリア
        // 最初のコードでマイグレーション状況を判定
        if (data.codes.length > 0 && data.codes[0].codeType) {
          setMigrationStatus('completed');
        } else {
          setMigrationStatus('pending');
        }
      } else {
        setCodesError(`招待コード一覧の取得に失敗: ${data.message || '不明なエラー'} (Status: ${response.status})`);
      }
    } catch (error: any) {
      console.error('🚨 Fetch codes error:', error);
      const errorDebugData: any = {
        url: '/api/admin/invitation-codes',
        method: 'GET',
        error: error.message,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString()
      };
      setDebugInfo(errorDebugData);
      setCodesError(`サーバーエラーが発生しました: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setCodesError('');
    setCodesSuccess('');

    try {
      console.log('🔍 Generating invitation code...');
      const requestBody = { ...generateForm, codeType: 'monthly' };
      
      const response = await fetch('/api/admin/invitation-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // デバッグ情報を収集
      const debugData: any = {
        url: '/api/admin/invitation-codes',
        method: 'POST',
        requestBody,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        timestamp: new Date().toISOString()
      };

      const data = await response.json();
      debugData.responseBody = data;
      setDebugInfo(debugData);
      
      console.log('🔍 Generate API Response:', debugData);

      if (data.success) {
        setCodesSuccess(`月次招待コード「${data.code}」を生成しました`);
        fetchCodes(); // 一覧を再取得
      } else {
        setCodesError(`招待コードの生成に失敗: ${data.message || '不明なエラー'} (Status: ${response.status})`);
      }
    } catch (error: any) {
      console.error('🚨 Generate code error:', error);
      const errorDebugData: any = {
        url: '/api/admin/invitation-codes',
        method: 'POST',
        requestBody: { ...generateForm, codeType: 'monthly' },
        error: error.message,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString()
      };
      setDebugInfo(errorDebugData);
      setCodesError(`サーバーエラーが発生しました: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateUserKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingUserKey(true);
    setCodesError('');
    setCodesSuccess('');

    try {
      const response = await fetch('/api/admin/invitation-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          codeType: 'user_specific',
          userName: userKeyForm.userName,
          userDescription: userKeyForm.userDescription,
          expirationDays: parseInt(userKeyForm.expirationDays)
        }),
      });

      const data = await response.json();

      if (data.success) {
        setCodesSuccess(`個別ユーザーキー「${data.code}」を生成しました（${userKeyForm.userName}様用）`);
        setUserKeyForm({ userName: '', userDescription: '', expirationDays: '30' }); // フォームリセット
        fetchCodes(); // 一覧を再取得
      } else {
        setCodesError(data.message || '個別ユーザーキーの生成に失敗しました');
      }
    } catch (error: any) {
      setCodesError('サーバーエラーが発生しました');
    } finally {
      setIsGeneratingUserKey(false);
    }
  };

  const handleDeactivateCode = async (code: string) => {
    if (!confirm(`招待コード「${code}」を無効化しますか？`)) {
      return;
    }

    try {
      const response = await fetch('/api/admin/invitation-codes/deactivate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setCodesSuccess('招待コードを無効化しました');
        fetchCodes(); // 一覧を再取得
      } else {
        setCodesError(data.message || '無効化に失敗しました');
      }
    } catch (error: any) {
      console.error('Delete error:', error);
      setCodesError(`サーバーエラーが発生しました: ${error.message}`);
    }
  };

  const handleDeleteCode = async (code: string) => {
    if (!confirm(`招待コード「${code}」を完全に削除しますか？\n※この操作は取り消せません。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/invitation-codes/delete?code=${encodeURIComponent(code)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setCodesSuccess('招待コードを削除しました');
        fetchCodes(); // 一覧を再取得
      } else {
        setCodesError(data.message || '削除に失敗しました');
      }
    } catch (error: any) {
      console.error('Delete code error:', error);
      setCodesError(`サーバーエラーが発生しました: ${error.message}`);
    }
  };

  const handleBulkDeleteExpiredCodes = async () => {
    const expiredCount = codes.filter(code => isExpired(code.expiresAt) && !code.isActive).length;
    
    if (expiredCount === 0) {
      setCodesError('削除対象の期限切れ・無効化済みコードはありません');
      return;
    }

    if (!confirm(`${expiredCount}件の期限切れ・無効化済みコードを一括削除しますか？\n※この操作は取り消せません。`)) {
      return;
    }

    try {
      const response = await fetch('/api/admin/invitation-codes/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deleteExpired: true }),
      });

      const data = await response.json();

      if (data.success) {
        setCodesSuccess(`${data.deletedCount}件の期限切れコードを削除しました`);
        fetchCodes(); // 一覧を再取得
      } else {
        setCodesError(data.message || '一括削除に失敗しました');
      }
    } catch (error: any) {
      console.error('Bulk delete error:', error);
      setCodesError(`サーバーエラーが発生しました: ${error.message}`);
    }
  };

  const fetchSlackSettings = async () => {
    try {
      const response = await fetch('/api/admin/slack-settings');
      const data = await response.json();

      if (data.success) {
        setSlackSettings(data);
      }
    } catch (error: any) {
      console.error('Failed to fetch Slack settings:', error);
    }
  };

  const handleSlackSave = async (testMode = false) => {
    if (testMode) {
      setSlackForm(prev => ({ ...prev, isTesting: true }));
    } else {
      setSlackForm(prev => ({ ...prev, isLoading: true }));
    }
    setSlackError('');
    setSlackSuccess('');

    try {
      const response = await fetch('/api/admin/slack-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookUrl: slackForm.webhookUrl,
          testMode
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSlackSuccess(data.message);
        if (!testMode) {
          setSlackForm(prev => ({ ...prev, webhookUrl: '' }));
          fetchSlackSettings(); // 設定を再取得
        }
      } else {
        setSlackError(data.message || 'Slack設定の保存に失敗しました');
      }
    } catch (error: any) {
      setSlackError('サーバーエラーが発生しました');
    } finally {
      if (testMode) {
        setSlackForm(prev => ({ ...prev, isTesting: false }));
      } else {
        setSlackForm(prev => ({ ...prev, isLoading: false }));
      }
    }
  };

  const handleSlackDelete = async () => {
    if (!confirm('Slack通知設定を削除しますか？')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/slack-settings', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setSlackSuccess('Slack通知設定を削除しました');
        fetchSlackSettings();
      } else {
        setSlackError(data.message || 'Slack設定の削除に失敗しました');
      }
    } catch (error: any) {
      setSlackError('サーバーエラーが発生しました');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
      router.push('/admin/login');
    } catch (error: any) {
      console.error('Logout error:', error);
    }
  };

  const handleMigrationRequest = async () => {
    if (!confirm('使用統計ログテーブルのマイグレーションを実行しますか？\n\nこの操作により、データベースに新しいテーブルが作成されます。')) {
      return;
    }

    try {
      setCodesError(''); // エラーをクリア
      const response = await fetch('/api/admin/migrate-usage-stats', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        alert(`マイグレーション完了！\n\n作成されたテーブル:\n${data.createdTables.join('\n')}\n\n使用統計機能が利用可能になりました。`);
        // 統計タブを再読み込みするため、ページを再読み込み
        window.location.reload();
      } else {
        setCodesError(`マイグレーション失敗: ${data.message}`);
      }
    } catch (error: any) {
      console.error('Migration error:', error);
      setCodesError(`マイグレーション実行中にエラーが発生しました: ${error.message}`);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP');
  };

  const isExpired = (dateString: string) => {
    return new Date(dateString) < new Date();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">管理画面</h1>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* 招待コード生成フォーム */}
          <div className="bg-white overflow-hidden shadow rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                招待コード生成
              </h3>
              
              {codesError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {codesError}
                </div>
              )}
              
              {codesSuccess && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                  {codesSuccess}
                </div>
              )}

              {/* デバッグ情報表示 - 常に表示 */}
              <div className="bg-gray-100 border border-gray-400 text-gray-800 px-4 py-3 rounded mb-4">
                <details className="cursor-pointer">
                  <summary className="font-semibold text-sm">🔍 デバッグ情報を表示</summary>
                  <div className="mt-2 text-xs">
                    {debugInfo ? (
                      <div className="grid grid-cols-1 gap-2">
                        <div><strong>URL:</strong> {debugInfo.url}</div>
                        <div><strong>Method:</strong> {debugInfo.method}</div>
                        <div><strong>Status:</strong> {debugInfo.status} {debugInfo.statusText}</div>
                        <div><strong>Timestamp:</strong> {debugInfo.timestamp}</div>
                        {debugInfo.requestBody && (
                          <div><strong>Request Body:</strong> <pre className="bg-gray-200 p-2 rounded text-xs overflow-auto">{JSON.stringify(debugInfo.requestBody, null, 2)}</pre></div>
                        )}
                        {debugInfo.responseBody && (
                          <div><strong>Response Body:</strong> <pre className="bg-gray-200 p-2 rounded text-xs overflow-auto">{JSON.stringify(debugInfo.responseBody, null, 2)}</pre></div>
                        )}
                        {debugInfo.error && (
                          <div><strong>Error:</strong> {debugInfo.error} ({debugInfo.errorType})</div>
                        )}
                        <div><strong>Headers:</strong> 
                          <pre className="bg-gray-200 p-2 rounded text-xs overflow-auto">{JSON.stringify(debugInfo.headers || {}, null, 2)}</pre>
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-500">
                        APIリクエストが実行されると、ここにデバッグ情報が表示されます。<br/>
                        招待コード一覧取得または生成ボタンをクリックしてください。
                      </div>
                    )}
                  </div>
                </details>
              </div>

              {/* デバッグ状態表示 */}
              <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
                <div className="text-sm">
                  <strong>デバッグ状態:</strong> debugInfo: {debugInfo ? '設定済み' : '未設定'}, 
                  codesError: {codesError ? `"${codesError}"` : '空'}, 
                  codesSuccess: {codesSuccess ? `"${codesSuccess}"` : '空'}
                </div>
              </div>

              {/* タブ選択 */}
              <div className="mb-6">
                <nav className="flex space-x-8">
                  <button
                    onClick={() => setActiveTab('monthly')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'monthly'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    📅 月次コード
                  </button>
                  <button
                    onClick={() => setActiveTab('user_specific')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'user_specific'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    👤 個別ユーザーキー
                  </button>
                  <button
                    onClick={() => setActiveTab('statistics')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'statistics'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    📊 使用統計
                  </button>
                </nav>
              </div>

              {/* 月次コード生成フォーム */}
              {activeTab === 'monthly' && (
                <form onSubmit={handleGenerateCode} className="space-y-4">
                  <div className="flex gap-4 items-end">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">年</label>
                      <select
                        value={generateForm.year}
                        onChange={(e) => setGenerateForm(prev => ({ ...prev, year: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        {[2025, 2026, 2027, 2028, 2029, 2030].map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">月</label>
                      <select
                        value={generateForm.month}
                        onChange={(e) => setGenerateForm(prev => ({ ...prev, month: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                          <option key={month} value={month}>{month}月</option>
                        ))}
                      </select>
                    </div>
                    
                    <button
                      type="submit"
                      disabled={isGenerating}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGenerating ? '生成中...' : '月次コード生成'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    💡 指定月の末日まで有効な月次招待コードを生成します（YYYYMM-XXXXX形式）
                  </p>
                </form>
              )}

              {/* 個別ユーザーキー生成フォーム */}
              {activeTab === 'user_specific' && (
                <>
                  {migrationStatus === 'pending' && (
                    <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
                      <p className="font-medium">⚠️ データベースマイグレーションが必要</p>
                      <p className="text-sm mt-1">
                        個別ユーザーキー機能を使用するには、データベースマイグレーションを実行してください。
                        <br />
                        詳細は <code>MIGRATION_INSTRUCTIONS.md</code> を参照してください。
                      </p>
                    </div>
                  )}
                <form onSubmit={handleGenerateUserKey} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">ユーザー名 *</label>
                      <input
                        type="text"
                        required
                        value={userKeyForm.userName}
                        onChange={(e) => setUserKeyForm(prev => ({ ...prev, userName: e.target.value }))}
                        placeholder="田中太郎"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">有効期限（日数）</label>
                      <select
                        value={userKeyForm.expirationDays}
                        onChange={(e) => setUserKeyForm(prev => ({ ...prev, expirationDays: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="7">7日間</option>
                        <option value="14">14日間</option>
                        <option value="30">30日間</option>
                        <option value="60">60日間</option>
                        <option value="90">90日間</option>
                        <option value="365">1年間</option>
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">用途・説明</label>
                    <textarea
                      value={userKeyForm.userDescription}
                      onChange={(e) => setUserKeyForm(prev => ({ ...prev, userDescription: e.target.value }))}
                      placeholder="例：テストユーザー、特別案件、デモ用など"
                      rows={3}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <button
                      type="submit"
                      disabled={isGeneratingUserKey || !userKeyForm.userName.trim()}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGeneratingUserKey ? '生成中...' : '個別キー生成'}
                    </button>
                    
                    <p className="text-xs text-gray-500">
                      💡 特定ユーザー専用のキーを生成します（USER-XXXXX形式）
                    </p>
                  </div>
                </form>
                </>
              )}

              {/* 統計タブ */}
              {activeTab === 'statistics' && (
                <UsageStatistics 
                  onMigrationRequest={handleMigrationRequest}
                />
              )}
            </div>
          </div>

          {/* Slack通知設定 */}
          <div className="bg-white overflow-hidden shadow rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Slack通知設定
              </h3>
              
              {slackError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {slackError}
                </div>
              )}
              
              {slackSuccess && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                  {slackSuccess}
                </div>
              )}
              
              {/* 現在の設定状況 */}
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      設定状況: {slackSettings.configured ? (
                        <span className="text-green-600">✅ 設定済み</span>
                      ) : (
                        <span className="text-gray-500">❌ 未設定</span>
                      )}
                    </p>
                    {slackSettings.configured && (
                      <div className="mt-1 text-xs text-gray-500">
                        {slackSettings.maskedUrl && <p>URL: {slackSettings.maskedUrl}</p>}
                        {slackSettings.updatedAt && (
                          <p>更新日時: {formatDate(slackSettings.updatedAt)}</p>
                        )}
                        <p>ステータス: {slackSettings.isValid ? '有効' : '無効'}</p>
                      </div>
                    )}
                  </div>
                  {slackSettings.configured && (
                    <button
                      onClick={handleSlackDelete}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                    >
                      設定削除
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Slack Webhook URL
                  </label>
                  <input
                    type="url"
                    value={slackForm.webhookUrl}
                    onChange={(e) => setSlackForm(prev => ({ ...prev, webhookUrl: e.target.value }))}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    新コード生成時にSlackチャンネルに通知を送信します
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSlackSave(true)}
                    disabled={!slackForm.webhookUrl || slackForm.isTesting}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {slackForm.isTesting ? 'テスト中...' : 'テスト送信'}
                  </button>
                  <button
                    onClick={() => handleSlackSave(false)}
                    disabled={!slackForm.webhookUrl || slackForm.isLoading}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {slackForm.isLoading ? '保存中...' : '設定保存'}
                  </button>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <h4 className="text-sm font-medium text-blue-800 mb-2">Slack Webhook URL の取得方法</h4>
                <ol className="text-xs text-blue-700 space-y-1">
                  <li>1. Slackワークスペースで「App」→「Incoming Webhooks」を検索</li>
                  <li>2. 「Add to Slack」をクリック</li>
                  <li>3. 通知を送信したいチャンネルを選択</li>
                  <li>4. 生成されたWebhook URLをコピーして上記に入力</li>
                </ol>
              </div>
            </div>
          </div>

          {/* 招待コード一覧 */}
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    招待コード一覧
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    生成された招待コードの管理
                  </p>
                </div>
                <div className="flex gap-2">
                  {codes.filter(code => isExpired(code.expiresAt) && !code.isActive).length > 0 && (
                    <button
                      onClick={handleBulkDeleteExpiredCodes}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      期限切れを一括削除 ({codes.filter(code => isExpired(code.expiresAt) && !code.isActive).length}件)
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {isLoading ? (
              <div className="px-4 py-5 text-center">読み込み中...</div>
            ) : codes.length === 0 ? (
              <div className="px-4 py-5 text-center text-gray-500">
                招待コードがありません
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {codes.map((code) => (
                  <li key={code.code} className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <div className="mr-3">
                            {code.codeType === 'monthly' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                📅 月次
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                👤 個別
                              </span>
                            )}
                          </div>
                          <p className="text-lg font-medium text-blue-600">
                            {code.code}
                          </p>
                          <div className="ml-4 flex gap-2">
                            {!code.isActive ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                無効
                              </span>
                            ) : isExpired(code.expiresAt) ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                期限切れ
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                有効
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* 個別ユーザーキーの場合は追加情報を表示 */}
                        {code.codeType === 'user_specific' && (
                          <div className="mt-1">
                            <p className="text-sm font-medium text-gray-700">
                              👤 {code.userName}
                            </p>
                            {code.userDescription && (
                              <p className="text-sm text-gray-500 mt-1">
                                {code.userDescription}
                              </p>
                            )}
                          </div>
                        )}
                        
                        <div className="mt-2 sm:flex sm:justify-between">
                          <div className="sm:flex gap-4 text-sm text-gray-500">
                            <p>作成日: {formatDate(code.createdAt)}</p>
                            <p>有効期限: {formatDate(code.expiresAt)}</p>
                            <p>使用回数: {code.usedCount}回</p>
                            <p>アクティブセッション: {code.activeSessions}個</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {code.isActive && !isExpired(code.expiresAt) && (
                          <button
                            onClick={() => handleDeactivateCode(code.code)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                          >
                            無効化
                          </button>
                        )}
                        {(isExpired(code.expiresAt) || !code.isActive) && (
                          <button
                            onClick={() => handleDeleteCode(code.code)}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
                            title="期限切れまたは無効化済みのコードを完全削除"
                          >
                            削除
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}