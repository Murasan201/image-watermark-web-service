'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Session {
  sessionId: string;
  codeUsed: string;
  createdAt: string;
  lastAccessed: string;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
      } else {
        // セッションが無効な場合は認証ページへ
        router.push('/auth');
      }
    } catch (error) {
      console.error('Session check failed:', error);
      router.push('/auth');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      router.push('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">
            Image Watermark Service
          </h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            ログアウト
          </button>
        </div>
        
        {session && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
            <h2 className="text-lg font-semibold text-green-800 mb-2">認証済み</h2>
            <p className="text-green-700">招待コード: {session.codeUsed}</p>
            <p className="text-green-700 text-sm">
              ログイン時刻: {new Date(session.createdAt).toLocaleString('ja-JP')}
            </p>
          </div>
        )}
        
        <div className="text-center">
          <p className="text-gray-600 mb-4">
            画像ウォーターマーク機能は開発中です
          </p>
          <p className="text-sm text-gray-500">
            Phase 3で実装予定: ファイルアップロード機能
          </p>
        </div>
      </div>
    </main>
  );
}