'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface InvitationCode {
  code: string;
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generateForm, setGenerateForm] = useState({
    year: new Date().getFullYear().toString(),
    month: (new Date().getMonth() + 1).toString()
  });
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
      const response = await fetch('/api/admin/invitation-codes');
      const data = await response.json();

      if (data.success) {
        setCodes(data.codes);
      } else {
        setError('招待コード一覧の取得に失敗しました');
      }
    } catch (error) {
      setError('サーバーエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/invitation-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(generateForm),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`招待コード「${data.code}」を生成しました`);
        fetchCodes(); // 一覧を再取得
      } else {
        setError(data.message || '招待コードの生成に失敗しました');
      }
    } catch (error) {
      setError('サーバーエラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeactivateCode = async (code: string) => {
    if (!confirm(`招待コード「${code}」を無効化しますか？`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/invitation-codes?code=${encodeURIComponent(code)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('招待コードを無効化しました');
        fetchCodes(); // 一覧を再取得
      } else {
        setError(data.message || '無効化に失敗しました');
      }
    } catch (error) {
      setError('サーバーエラーが発生しました');
    }
  };

  const fetchSlackSettings = async () => {
    try {
      const response = await fetch('/api/admin/slack-settings');
      const data = await response.json();

      if (data.success) {
        setSlackSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch Slack settings:', error);
    }
  };

  const handleSlackSave = async (testMode = false) => {
    if (testMode) {
      setSlackForm(prev => ({ ...prev, isTesting: true }));
    } else {
      setSlackForm(prev => ({ ...prev, isLoading: true }));
    }
    setError('');
    setSuccess('');

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
        setSuccess(data.message);
        if (!testMode) {
          setSlackForm(prev => ({ ...prev, webhookUrl: '' }));
          fetchSlackSettings(); // 設定を再取得
        }
      } else {
        setError(data.message || 'Slack設定の保存に失敗しました');
      }
    } catch (error) {
      setError('サーバーエラーが発生しました');
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
        setSuccess('Slack通知設定を削除しました');
        fetchSlackSettings();
      } else {
        setError(data.message || 'Slack設定の削除に失敗しました');
      }
    } catch (error) {
      setError('サーバーエラーが発生しました');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
      router.push('/admin/login');
    } catch (error) {
      console.error('Logout error:', error);
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
              
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}
              
              {success && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                  {success}
                </div>
              )}

              <form onSubmit={handleGenerateCode} className="flex gap-4 items-end">
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
                  {isGenerating ? '生成中...' : '招待コード生成'}
                </button>
              </form>
            </div>
          </div>

          {/* Slack通知設定 */}
          <div className="bg-white overflow-hidden shadow rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Slack通知設定
              </h3>
              
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
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                招待コード一覧
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                生成された招待コードの管理
              </p>
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
                        <div className="mt-2 sm:flex sm:justify-between">
                          <div className="sm:flex gap-4 text-sm text-gray-500">
                            <p>作成日: {formatDate(code.createdAt)}</p>
                            <p>有効期限: {formatDate(code.expiresAt)}</p>
                            <p>使用回数: {code.usedCount}回</p>
                            <p>アクティブセッション: {code.activeSessions}個</p>
                          </div>
                        </div>
                      </div>
                      {code.isActive && !isExpired(code.expiresAt) && (
                        <button
                          onClick={() => handleDeactivateCode(code.code)}
                          className="ml-4 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                        >
                          無効化
                        </button>
                      )}
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