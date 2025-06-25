'use client';

import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface OverviewStats {
  today: {
    today_processing_count: number;
    today_file_count: number;
    today_data_processed: number;
    today_avg_processing_time: number;
  };
  month: {
    month_processing_count: number;
    month_file_count: number;
    month_data_processed: number;
    active_codes_count: number;
  };
  realtime: {
    current_processing: number;
    current_waiting: number;
    active_sessions: number;
  };
  trend: Array<{
    stat_date: string;
    daily_processing_count: number;
    daily_file_count: number;
    daily_data_processed: number;
  }>;
  errors: {
    total_failed: number;
    total_partial: number;
    total_success: number;
  };
}

interface UsageStatisticsProps {
  onMigrationRequest: () => void;
}

export default function UsageStatistics({ onMigrationRequest }: UsageStatisticsProps) {
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStatsTab, setActiveStatsTab] = useState<'overview' | 'daily' | 'codes'>('overview');
  const [needsMigration, setNeedsMigration] = useState(false);

  useEffect(() => {
    checkMigrationStatus();
  }, []);

  const checkMigrationStatus = async () => {
    try {
      setLoading(true);
      // まずマイグレーション状況を確認
      const migrationResponse = await fetch('/api/admin/migrate-usage-stats');
      
      if (migrationResponse.ok) {
        const migrationData = await migrationResponse.json();
        
        if (migrationData.migrationStatus === 'COMPLETED') {
          // マイグレーション完了済みの場合、統計を取得
          await fetchOverviewStats();
        } else {
          // マイグレーション未完了の場合
          setNeedsMigration(true);
          setError('使用統計機能を利用するには、データベースマイグレーションが必要です。');
        }
      } else {
        // マイグレーション確認APIが失敗した場合、統計APIで判定
        await fetchOverviewStats();
      }
    } catch (error: any) {
      console.error('Migration status check error:', error);
      // マイグレーション確認に失敗した場合も統計APIで判定
      await fetchOverviewStats();
    } finally {
      setLoading(false);
    }
  };

  const fetchOverviewStats = async () => {
    try {
      const response = await fetch('/api/admin/usage-stats?type=overview');
      
      if (!response.ok) {
        if (response.status === 500) {
          // 500エラーの場合、レスポンス内容を確認
          const errorData = await response.json().catch(() => null);
          if (errorData && (
            errorData.message?.includes('does not exist') ||
            errorData.message?.includes('relation') ||
            errorData.message?.includes('daily_stats') ||
            errorData.message?.includes('usage_logs')
          )) {
            setNeedsMigration(true);
            setError('使用統計機能を利用するには、データベースマイグレーションが必要です。');
            return;
          }
        }
        throw new Error(`統計取得に失敗しました: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setOverviewStats(data.overview);
        setError(null);
        setNeedsMigration(false);
      } else {
        throw new Error(data.message || '統計取得に失敗しました');
      }
    } catch (error: any) {
      console.error('Overview stats fetch error:', error);
      
      // データベーステーブルが存在しない場合の判定
      if (error.message.includes('does not exist') || 
          error.message.includes('table') || 
          error.message.includes('relation') ||
          error.message.includes('daily_stats') ||
          error.message.includes('usage_logs') ||
          error.message.includes('system_status_logs')) {
        setNeedsMigration(true);
        setError('使用統計機能を利用するには、データベースマイグレーションが必要です。');
      } else {
        setError(error.message || '統計の取得中にエラーが発生しました');
      }
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // マイグレーション画面
  if (needsMigration) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-blue-800">
              📊 使用統計機能の初期設定
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>使用統計ログ機能を利用するには、データベースマイグレーションが必要です。</p>
              <p className="mt-2">このマイグレーションにより、以下のテーブルが作成されます：</p>
              <ul className="mt-1 list-disc list-inside">
                <li>usage_logs - 画像処理実行ログ</li>
                <li>daily_stats - 日次統計集計</li>
                <li>system_status_logs - システム状態ログ</li>
              </ul>
            </div>
            <div className="mt-4">
              <button
                onClick={async () => {
                  await onMigrationRequest();
                  // マイグレーション成功後、統計を再取得
                  setNeedsMigration(false);
                  await checkMigrationStatus();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                マイグレーション実行
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">統計データを読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">統計データの取得に失敗しました</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                onClick={fetchOverviewStats}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
              >
                再試行
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!overviewStats) {
    return <div className="text-gray-500">統計データがありません</div>;
  }

  // 過去7日間のトレンドグラフデータ
  const trendData = {
    labels: overviewStats.trend.map(item => 
      new Date(item.stat_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
    ).reverse(),
    datasets: [
      {
        label: '処理回数',
        data: overviewStats.trend.map(item => item.daily_processing_count).reverse(),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.1,
      },
      {
        label: 'ファイル数',
        data: overviewStats.trend.map(item => item.daily_file_count).reverse(),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.1,
      }
    ],
  };

  // エラー統計ドーナツグラフ
  const errorData = {
    labels: ['成功', '部分失敗', '失敗'],
    datasets: [
      {
        data: [
          overviewStats.errors.total_success,
          overviewStats.errors.total_partial,
          overviewStats.errors.total_failed
        ],
        backgroundColor: [
          'rgb(34, 197, 94)',
          'rgb(251, 191, 36)',
          'rgb(239, 68, 68)'
        ],
        borderWidth: 2,
      }
    ],
  };

  return (
    <div className="space-y-6">
      {/* 概要統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                <span className="text-blue-600 text-sm font-medium">📊</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">今日の処理回数</p>
              <p className="text-2xl font-semibold text-gray-900">
                {overviewStats.today.today_processing_count}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                <span className="text-green-600 text-sm font-medium">📁</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">今日のファイル数</p>
              <p className="text-2xl font-semibold text-gray-900">
                {overviewStats.today.today_file_count}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                <span className="text-purple-600 text-sm font-medium">💾</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">今月のデータ処理量</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatBytes(overviewStats.month.month_data_processed)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-yellow-100 rounded-md flex items-center justify-center">
                <span className="text-yellow-600 text-sm font-medium">⚡</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">アクティブセッション</p>
              <p className="text-2xl font-semibold text-gray-900">
                {overviewStats.realtime.active_sessions}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* キューシステム統計 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">🚦 リアルタイムキュー状況</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {overviewStats.realtime.current_processing}
            </div>
            <div className="text-sm text-gray-600 mt-1">処理中</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {overviewStats.realtime.current_waiting}
            </div>
            <div className="text-sm text-gray-600 mt-1">待機中</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {overviewStats.realtime.active_sessions}
            </div>
            <div className="text-sm text-gray-600 mt-1">アクティブユーザー</div>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">
            <div className="flex justify-between">
              <span>キュー効率:</span>
              <span className={`font-medium ${overviewStats.realtime.current_waiting === 0 ? 'text-green-600' : 'text-yellow-600'}`}>
                {overviewStats.realtime.current_waiting === 0 ? '最適' : `${overviewStats.realtime.current_waiting}人待機中`}
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span>システム負荷:</span>
              <span className={`font-medium ${
                overviewStats.realtime.current_processing === 0 ? 'text-green-600' : 
                overviewStats.realtime.current_processing === 1 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {overviewStats.realtime.current_processing === 0 ? '低' : 
                 overviewStats.realtime.current_processing === 1 ? '標準' : '高'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* グラフセクション */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 過去7日間のトレンド */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">過去7日間のトレンド</h3>
          <div className="h-64">
            <Line
              data={trendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                  },
                },
              }}
            />
          </div>
        </div>

        {/* エラー統計 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">処理結果統計（過去30日）</h3>
          <div className="h-64 flex items-center justify-center">
            <div className="w-48 h-48">
              <Doughnut
                data={errorData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom' as const,
                    },
                  },
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Vercel使用量分析 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">🔍 Vercel使用量分析</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <h4 className="font-medium text-gray-700 mb-2">関数実行回数（推定）</h4>
            <p className="text-2xl font-semibold text-blue-600">
              {overviewStats.month.month_processing_count}
            </p>
            <p className="text-sm text-gray-500 mt-1">今月の処理回数</p>
          </div>
          
          <div className="border rounded-lg p-4">
            <h4 className="font-medium text-gray-700 mb-2">データ転送量</h4>
            <p className="text-2xl font-semibold text-green-600">
              {formatBytes(overviewStats.month.month_data_processed)}
            </p>
            <p className="text-sm text-gray-500 mt-1">今月のファイル処理量</p>
          </div>
          
          <div className="border rounded-lg p-4">
            <h4 className="font-medium text-gray-700 mb-2">アクティブコード数</h4>
            <p className="text-2xl font-semibold text-purple-600">
              {overviewStats.month.active_codes_count}
            </p>
            <p className="text-sm text-gray-500 mt-1">今月使用されたコード数</p>
          </div>
        </div>
        
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="font-medium text-yellow-800 mb-2">💡 有料プラン検討の目安</h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• 月間処理回数が1000回を超えた場合</li>
            <li>• データ転送量が100MB/月を超えた場合</li>
            <li>• 同時アクセス数が5ユーザーを超える場合</li>
            <li>• エラー率が5%を超える場合</li>
          </ul>
        </div>
      </div>
    </div>
  );
}