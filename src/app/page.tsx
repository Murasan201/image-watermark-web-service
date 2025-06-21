'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import JSZip from 'jszip';

interface Session {
  sessionId: string;
  codeUsed: string;
  createdAt: string;
  lastAccessed: string;
}

interface UploadedFile {
  file: File;
  id: string;
  preview: string;           // 元画像プレビュー
  processed?: string;        // 処理済み画像URL
  isShowingProcessed: boolean; // 表示切替フラグ
}

interface WatermarkSettings {
  text: string;
  fontSize: number;
  fontFamily: string;
  position: 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right';
  opacity: number;
  shadowEnabled: boolean;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowOpacity: number;
  color: string;
}

interface QueueStatus {
  userQueue: any;
  userPosition: number | null;
  queueStats: {
    totalWaiting: number;
    processingCount: number;
    nextPosition: number;
  };
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'warning' | 'error' | 'info'>('error');
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [isInQueue, setIsInQueue] = useState(false);
  const [queuePolling, setQueuePolling] = useState<NodeJS.Timeout | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [currentProcessingFile, setCurrentProcessingFile] = useState<string | null>(null);
  const [watermarkSettings, setWatermarkSettings] = useState<WatermarkSettings>({
    text: 'Sample Watermark',
    fontSize: 36,
    fontFamily: 'Arial',
    position: 'bottom-right',
    opacity: 0.7,
    shadowEnabled: true,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    shadowOpacity: 0.5,
    color: '#ffffff'
  });

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    // コンポーネントアンマウント時にポーリングをクリア
    return () => {
      if (queuePolling) {
        clearInterval(queuePolling);
      }
    };
  }, [queuePolling]);

  // 離脱防止機能
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (processing || isInQueue) {
        e.preventDefault();
        e.returnValue = '処理中または待機中です。このページを離れると処理が中断されます。本当に離れますか？';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [processing, isInQueue]);

  const checkSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
      } else {
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
      // キューポーリングを停止
      if (queuePolling) {
        clearInterval(queuePolling);
        setQueuePolling(null);
      }
      
      // キューからの退出
      if (isInQueue) {
        await fetch('/api/queue', { method: 'DELETE' });
      }
      
      await fetch('/api/auth/session', { method: 'DELETE' });
      router.push('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // キューステータスを取得
  const checkQueueStatus = async () => {
    try {
      const response = await fetch('/api/queue');
      if (response.ok) {
        const data = await response.json();
        setQueueStatus(data);
        
        // ユーザーがキューにいる場合
        if (data.userQueue) {
          setIsInQueue(true);
          
          // 処理開始可能になった場合
          if (data.userQueue.status === 'processing' && !processing) {
            console.log('Processing can start now');
            setIsInQueue(false);
            if (queuePolling) {
              clearInterval(queuePolling);
              setQueuePolling(null);
            }
          }
        } else {
          setIsInQueue(false);
        }
      }
    } catch (error) {
      console.error('Queue status check failed:', error);
    }
  };

  // キューに参加
  const joinQueue = async () => {
    try {
      const response = await fetch('/api/queue', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setQueueStatus(data);
        
        if (data.canStartImmediately) {
          // 即座に処理開始可能
          console.log('Can start processing immediately');
          return true;
        } else {
          // キューで待機
          setIsInQueue(true);
          startQueuePolling();
          return false;
        }
      } else {
        setError(data.message || 'キューへの参加に失敗しました');
        return false;
      }
    } catch (error) {
      console.error('Queue join failed:', error);
      setError('キューへの参加に失敗しました');
      return false;
    }
  };

  // キューポーリング開始
  const startQueuePolling = () => {
    if (queuePolling) {
      clearInterval(queuePolling);
    }
    
    const interval = setInterval(checkQueueStatus, 2000); // 2秒間隔
    setQueuePolling(interval);
  };

  // キューから退出
  const leaveQueue = async () => {
    try {
      const response = await fetch('/api/queue', { method: 'DELETE' });
      if (response.ok) {
        setIsInQueue(false);
        setQueueStatus(null);
        
        if (queuePolling) {
          clearInterval(queuePolling);
          setQueuePolling(null);
        }
      }
    } catch (error) {
      console.error('Queue leave failed:', error);
    }
  };

  // 処理完了をキューに通知
  const completeQueue = async () => {
    try {
      await fetch('/api/queue?action=complete', { method: 'DELETE' });
      setIsInQueue(false);
      setQueueStatus(null);
    } catch (error) {
      console.error('Queue completion failed:', error);
    }
  };

  // エラー表示ヘルパー関数
  const showError = (message: string, type: 'warning' | 'error' | 'info' = 'error') => {
    setError(message);
    setErrorType(type);
  };

  const clearError = () => {
    setError(null);
    setErrorType('error');
  };

  // ユーザーフレンドリーなエラーメッセージ変換
  const getFriendlyErrorMessage = (error: Error | string): { message: string; type: 'warning' | 'error' | 'info' } => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    // ファイルサイズエラー
    if (errorMessage.includes('3MB') || errorMessage.includes('15MB')) {
      return {
        message: `${errorMessage}\n\n💡 解決方法：\n・画像を圧縮してサイズを小さくしてください\n・複数ファイルの場合は、数を減らしてください`,
        type: 'warning'
      };
    }
    
    // ファイル形式エラー
    if (errorMessage.includes('.jpg') || errorMessage.includes('.jpeg')) {
      return {
        message: `${errorMessage}\n\n💡 解決方法：\n・ファイルを .jpg または .jpeg 形式に変換してください\n・画像編集ソフトで保存し直してください`,
        type: 'warning'
      };
    }
    
    // キューエラー
    if (errorMessage.includes('キュー') || errorMessage.includes('待機')) {
      return {
        message: `${errorMessage}\n\n💡 現在多くのユーザーが利用中です。しばらくお待ちください。`,
        type: 'info'
      };
    }
    
    // 処理失敗エラー
    if (errorMessage.includes('処理に失敗')) {
      return {
        message: `${errorMessage}\n\n💡 解決方法：\n・画像ファイルが破損していないか確認してください\n・別の画像で試してみてください\n・ブラウザを再読み込みしてみてください`,
        type: 'error'
      };
    }
    
    // ZIP作成エラー
    if (errorMessage.includes('ZIP')) {
      return {
        message: `${errorMessage}\n\n💡 代替手段：\n・個別ダウンロードをご利用ください\n・ファイル数を減らして再試行してください`,
        type: 'warning'
      };
    }
    
    // ネットワークエラー
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return {
        message: `ネットワーク接続に問題があります。\n\n💡 解決方法：\n・インターネット接続を確認してください\n・しばらく待ってから再試行してください`,
        type: 'error'
      };
    }
    
    // デフォルト
    return {
      message: `${errorMessage}\n\n💡 問題が続く場合は、ページを再読み込みしてみてください。`,
      type: 'error'
    };
  };

  const validateFile = (file: File): string | null => {
    // ファイル形式チェック (.jpg/.jpeg のみ)
    const allowedTypes = ['image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return `${file.name}: .jpg/.jpeg ファイルのみ対応しています`;
    }

    // ファイルサイズチェック (3MB以下)
    const maxSize = 3 * 1024 * 1024; // 3MB
    if (file.size > maxSize) {
      return `${file.name}: ファイルサイズが3MBを超えています (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
    }

    return null;
  };

  const validateFileSet = (files: File[]): string | null => {
    // 最大5ファイル
    if (files.length > 5) {
      return '一度にアップロードできるファイルは最大5個までです';
    }

    // 総計15MB以下（クライアント処理統一）
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxTotalSize = 15 * 1024 * 1024; // 15MB
    if (totalSize > maxTotalSize) {
      return `ファイルの総サイズが15MBを超えています (${(totalSize / 1024 / 1024).toFixed(1)}MB)`;
    }

    return null;
  };

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files);
    setError(null);

    // 個別ファイル検証
    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        const friendlyError = getFriendlyErrorMessage(error);
        showError(friendlyError.message, friendlyError.type);
        return;
      }
    }

    // 既存ファイルとの組み合わせチェック
    const allFiles = [...uploadedFiles.map(uf => uf.file), ...fileArray];
    const validationError = validateFileSet(allFiles);
    if (validationError) {
      const friendlyError = getFriendlyErrorMessage(validationError);
      showError(friendlyError.message, friendlyError.type);
      return;
    }

    // ファイル追加処理
    const newFiles: UploadedFile[] = fileArray.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      preview: URL.createObjectURL(file),
      isShowingProcessed: false
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
        if (file.processed) {
          URL.revokeObjectURL(file.processed);
        }
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const clearAllFiles = () => {
    uploadedFiles.forEach(file => {
      URL.revokeObjectURL(file.preview);
      if (file.processed) {
        URL.revokeObjectURL(file.processed);
      }
    });
    setUploadedFiles([]);
    clearError();
  };

  const processImages = async () => {
    if (uploadedFiles.length === 0) {
      setError('処理する画像がありません');
      return;
    }

    setError(null);

    // キューに参加
    const canStartImmediately = await joinQueue();
    
    if (!canStartImmediately) {
      // キューで待機中
      return;
    }

    setProcessing(true);

    try {
      // 🎨 新しい統一処理ロジック：全てクライアントサイド処理
      const totalSize = uploadedFiles.reduce((sum, file) => sum + file.file.size, 0);
      const fileCount = uploadedFiles.length;
      
      // ファイル制限チェック
      if (fileCount > 5) {
        throw new Error('一度にアップロードできるファイルは最大5個までです。');
      }
      
      if (totalSize > 15 * 1024 * 1024) {
        throw new Error('ファイルの総サイズが15MBを超えています。ファイル数を減らすか、サイズを小さくしてください。');
      }

      // 🚀 全ファイルをクライアントサイド処理（問題8の根本解決）
      console.log(`🎨 Using unified client-side processing for ${fileCount} files (total: ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
      await processImagesClient();
    } catch (error) {
      console.error('Image processing failed:', error);
      setError(error instanceof Error ? error.message : '画像処理に失敗しました');
    } finally {
      setProcessing(false);
      // プログレスリセット
      setProcessingProgress(0);
      setCurrentProcessingFile(null);
      // キューから退出
      await completeQueue();
    }
  };

  const processImagesClient = async () => {
    const processedFiles: UploadedFile[] = [];
    const failedFiles: string[] = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      const uploadedFile = uploadedFiles[i];
      
      // プログレス更新
      setCurrentProcessingFile(uploadedFile.file.name);
      setProcessingProgress((i / uploadedFiles.length) * 100);
      
      try {
        const processedUrl = await applyWatermarkCanvas(uploadedFile.file, watermarkSettings);
        
        // 既存の処理済み画像URLがあれば解放
        if (uploadedFile.processed) {
          URL.revokeObjectURL(uploadedFile.processed);
        }
        
        processedFiles.push({
          ...uploadedFile,
          processed: processedUrl,
          isShowingProcessed: true
        });
      } catch (error) {
        console.error(`Failed to process ${uploadedFile.file.name}:`, error);
        failedFiles.push(uploadedFile.file.name);
        
        // 失敗したファイルも配列に追加（処理済みなしで）
        processedFiles.push({
          ...uploadedFile,
          isShowingProcessed: false
        });
      }
    }

    setUploadedFiles(processedFiles);

    // プログレス完了
    setProcessingProgress(100);
    setCurrentProcessingFile(null);

    // 部分失敗の場合はエラーメッセージを表示
    if (failedFiles.length > 0) {
      const successCount = uploadedFiles.length - failedFiles.length;
      const friendlyError = getFriendlyErrorMessage(`${failedFiles.length}個のファイル処理に失敗しました (${successCount}個は正常に処理されました): ${failedFiles.join(', ')}`);
      showError(friendlyError.message, friendlyError.type);
    }
  };


  const applyWatermarkCanvas = (file: File, settings: WatermarkSettings): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context を取得できませんでした'));
        return;
      }

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;

        // 元画像を描画
        ctx.drawImage(img, 0, 0);

        // ウォーターマーク設定
        ctx.fillStyle = settings.color;
        ctx.font = `${settings.fontSize}px ${settings.fontFamily}`;
        ctx.globalAlpha = settings.opacity;

        // 影の設定
        if (settings.shadowEnabled) {
          ctx.shadowColor = 'rgba(0, 0, 0, ' + settings.shadowOpacity + ')';
          ctx.shadowOffsetX = settings.shadowOffsetX;
          ctx.shadowOffsetY = settings.shadowOffsetY;
          ctx.shadowBlur = 2;
        }

        // テキスト位置計算
        const textWidth = ctx.measureText(settings.text).width;
        const padding = 20;
        let x, y;

        switch (settings.position) {
          case 'top-left':
            x = padding;
            y = settings.fontSize + padding;
            break;
          case 'top-right':
            x = canvas.width - textWidth - padding;
            y = settings.fontSize + padding;
            break;
          case 'center':
            x = (canvas.width - textWidth) / 2;
            y = (canvas.height + settings.fontSize) / 2;
            break;
          case 'bottom-left':
            x = padding;
            y = canvas.height - padding;
            break;
          case 'bottom-right':
          default:
            x = canvas.width - textWidth - padding;
            y = canvas.height - padding;
            break;
        }

        // ウォーターマークテキストを描画
        ctx.fillText(settings.text, x, y);

        // Blob として出力
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            resolve(url);
          } else {
            reject(new Error('画像の出力に失敗しました'));
          }
        }, 'image/jpeg', 0.9);
      };

      img.onerror = () => {
        reject(new Error('画像の読み込みに失敗しました'));
      };

      img.src = URL.createObjectURL(file);
    });
  };

  const downloadFile = (file: UploadedFile) => {
    if (!file.processed) return;

    const link = document.createElement('a');
    link.href = file.processed;
    link.download = `watermarked_${file.file.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllFiles = async () => {
    const processedFiles = uploadedFiles.filter(file => file.processed);
    
    if (processedFiles.length === 0) {
      setError('ダウンロードできる処理済みファイルがありません');
      return;
    }

    if (processedFiles.length === 1) {
      // 1ファイルの場合は個別ダウンロード
      downloadFile(processedFiles[0]);
      return;
    }

    // ダウンロード方式自動判定
    const downloadMethod = determineDownloadMethod(processedFiles);
    
    if (downloadMethod === 'ZIP') {
      await downloadAsZip(processedFiles);
    } else {
      // 個別ダウンロード（フォールバック）
      processedFiles.forEach(file => downloadFile(file));
    }
  };

  const determineDownloadMethod = (files: UploadedFile[]): 'ZIP' | 'INDIVIDUAL' => {
    try {
      // 各ファイルのサイズを概算（Base64 dataURLから）
      const totalSize = files.reduce((sum, file) => {
        if (!file.processed) return sum;
        
        // Base64データのサイズを概算（実際のバイナリサイズ）
        const base64Data = file.processed.split(',')[1];
        const binarySize = (base64Data.length * 3) / 4;
        return sum + binarySize;
      }, 0);

      // 4MB以下はZIP、超過時は個別
      const maxZipSize = 4 * 1024 * 1024; // 4MB
      return totalSize <= maxZipSize ? 'ZIP' : 'INDIVIDUAL';
    } catch (error) {
      console.error('Error determining download method:', error);
      return 'INDIVIDUAL';
    }
  };


  const adjustFontSizeToStep = (value: number): number => {
    // 境界値を確実に処理
    if (value >= 500) return 500;
    if (value <= 12) return 12;

    // 適切なステップに合わせて値を調整
    if (value <= 50) {
      return value; // 1px刻みなのでそのまま
    } else if (value <= 100) {
      return Math.round(value / 2) * 2; // 2px刻み
    } else if (value <= 200) {
      return Math.round(value / 5) * 5; // 5px刻み
    } else {
      return Math.round(value / 10) * 10; // 10px刻み
    }
  };

  const downloadAsZip = async (files: UploadedFile[]) => {
    try {
      const zip = new JSZip();
      
      // 各ファイルをZIPに追加
      files.forEach((file, index) => {
        if (!file.processed) return;
        
        // Base64データを取得
        const base64Data = file.processed.split(',')[1];
        const fileName = `watermarked_${file.file.name}`;
        
        // ファイル名の重複を避ける
        const uniqueFileName = files.filter((f, i) => i < index && f.file.name === file.file.name).length > 0
          ? `watermarked_${index + 1}_${file.file.name}`
          : fileName;
        
        zip.file(uniqueFileName, base64Data, { base64: true });
      });

      // ZIPファイルを生成
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      });

      // ダウンロード
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `watermarked_images_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // メモリ解放
      URL.revokeObjectURL(link.href);
      
    } catch (error) {
      console.error('ZIP generation failed:', error);
      setError('ZIP作成に失敗しました。個別ダウンロードをお試しください。');
      
      // フォールバック：個別ダウンロード
      files.forEach(file => downloadFile(file));
    }
  };

  const toggleImageDisplay = (id: string) => {
    setUploadedFiles(prev => 
      prev.map(file => 
        file.id === id 
          ? { ...file, isShowingProcessed: !file.isShowingProcessed }
          : file
      )
    );
  };

  const reprocessFile = async (id: string) => {
    const file = uploadedFiles.find(f => f.id === id);
    if (!file) return;

    setProcessing(true);
    setError(null);

    try {
      // 🎨 統一処理：全てクライアントサイド処理
      console.log(`🔄 Reprocessing ${file.file.name} with client-side processing`);
      const processedUrl = await applyWatermarkCanvas(file.file, watermarkSettings);
      
      // 既存の処理済み画像URLがあれば解放
      if (file.processed) {
        URL.revokeObjectURL(file.processed);
      }

      setUploadedFiles(prev => 
        prev.map(f => 
          f.id === id 
            ? { ...f, processed: processedUrl, isShowingProcessed: true }
            : f
        )
      );
    } catch (error) {
      console.error(`Failed to reprocess ${file.file.name}:`, error);
      setError(`${file.file.name} の再処理に失敗しました`);
    } finally {
      setProcessing(false);
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
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Image Watermark Service
          </h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            ログアウト
          </button>
        </div>

        {/* セッション情報 */}
        {session && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
            <h2 className="text-lg font-semibold text-green-800 mb-2">認証済み</h2>
            <p className="text-green-700">招待コード: {session.codeUsed}</p>
            <p className="text-green-700 text-sm">
              ログイン時刻: {new Date(session.createdAt).toLocaleString('ja-JP')}
            </p>
          </div>
        )}

        {/* キュー待機表示 */}
        {isInQueue && queueStatus && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <div className="flex items-center space-x-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
              <div>
                <h2 className="text-lg font-semibold text-yellow-800">処理待機中</h2>
                {queueStatus.userPosition && (
                  <p className="text-yellow-700">
                    順番待ち中... あと{queueStatus.userPosition}人待ちです
                  </p>
                )}
                <p className="text-yellow-700 text-sm">
                  現在の待機者数: {queueStatus.queueStats.totalWaiting}人 | 
                  処理中: {queueStatus.queueStats.processingCount}人
                </p>
                <p className="text-yellow-600 text-xs mt-2">
                  ⏰ 最大10分でタイムアウトします。この画面を離れないでください。
                </p>
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={leaveQueue}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
              >
                キューから退出
              </button>
            </div>
          </div>
        )}

        {/* プログレスバー表示 */}
        {processing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <div className="flex items-center space-x-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-blue-800">画像処理中</h2>
                {currentProcessingFile && (
                  <p className="text-blue-700 text-sm">
                    処理中: {currentProcessingFile}
                  </p>
                )}
                <div className="mt-3">
                  <div className="flex justify-between text-sm text-blue-600 mb-1">
                    <span>進捗</span>
                    <span>{Math.round(processingProgress)}%</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${processingProgress}%` }}
                    ></div>
                  </div>
                </div>
                <p className="text-blue-600 text-xs mt-2">
                  ⚠️ 処理中はこの画面を離れないでください
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
          {/* ファイルアップロード */}
          <div className="xl:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4">ファイルアップロード</h2>
              
              {/* ドラッグ&ドロップエリア */}
              <div
                className={`border-2 border-dashed rounded-lg p-4 sm:p-8 text-center cursor-pointer transition-colors ${
                  isDragging 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-gray-600">
                  <svg className="mx-auto h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-lg font-medium mb-2">
                    ファイルをドラッグ&ドロップ、またはクリックして選択
                  </p>
                  <p className="text-sm text-gray-500">
                    .jpg/.jpeg ファイル（最大5ファイル、1ファイル3MB以下、総計15MB以下）
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />

              {/* エラー表示 */}
              {error && (
                <div className={`mt-4 rounded-lg p-4 ${
                  errorType === 'warning' 
                    ? 'bg-yellow-50 border border-yellow-200'
                    : errorType === 'info'
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-start space-x-3">
                    <div className={`flex-shrink-0 ${
                      errorType === 'warning' 
                        ? 'text-yellow-500'
                        : errorType === 'info'
                        ? 'text-blue-500'
                        : 'text-red-500'
                    }`}>
                      {errorType === 'warning' ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      ) : errorType === 'info' ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <pre className={`text-sm whitespace-pre-line ${
                        errorType === 'warning' 
                          ? 'text-yellow-700'
                          : errorType === 'info'
                          ? 'text-blue-700'
                          : 'text-red-700'
                      }`}>
                        {error}
                      </pre>
                      <button
                        onClick={clearError}
                        className={`mt-2 text-xs underline ${
                          errorType === 'warning' 
                            ? 'text-yellow-600 hover:text-yellow-800'
                            : errorType === 'info'
                            ? 'text-blue-600 hover:text-blue-800'
                            : 'text-red-600 hover:text-red-800'
                        }`}
                      >
                        メッセージを閉じる
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* アップロードファイル一覧 */}
              {uploadedFiles.length > 0 && (
                <div className="mt-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                    <h3 className="text-lg font-medium">アップロード済みファイル ({uploadedFiles.length}/5)</h3>
                    <button
                      onClick={clearAllFiles}
                      className="text-red-600 hover:text-red-800 text-sm self-start sm:self-auto"
                    >
                      すべて削除
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {uploadedFiles.map(file => (
                      <div key={file.id} className="p-4 border rounded-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                          <div className="flex-shrink-0">
                            <div className="relative">
                              <img
                                src={file.isShowingProcessed && file.processed ? file.processed : file.preview}
                                alt={file.file.name}
                                className="w-16 h-16 object-cover rounded"
                              />
                              {file.processed && (
                                <button
                                  onClick={() => toggleImageDisplay(file.id)}
                                  className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 text-white rounded-full text-xs hover:bg-blue-600 flex items-center justify-center"
                                  title={file.isShowingProcessed ? "元画像を表示" : "処理済み画像を表示"}
                                >
                                  {file.isShowingProcessed ? "元" : "処"}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex-grow">
                            <p className="font-medium">{file.file.name}</p>
                            <p className="text-sm text-gray-500">
                              {(file.file.size / 1024 / 1024).toFixed(1)}MB
                            </p>
                            <div className="flex items-center space-x-2 mt-1">
                              {file.processed && (
                                <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                                  処理済み
                                </span>
                              )}
                              {file.processed && file.isShowingProcessed && (
                                <span className="text-xs text-blue-600">
                                  処理済み画像表示中
                                </span>
                              )}
                              {file.processed && !file.isShowingProcessed && (
                                <span className="text-xs text-gray-600">
                                  元画像表示中
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mt-3">
                          {file.processed && (
                            <>
                              <button
                                onClick={() => downloadFile(file)}
                                className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                              >
                                ダウンロード
                              </button>
                              <button
                                onClick={() => reprocessFile(file.id)}
                                disabled={processing}
                                className={`px-3 py-1 rounded text-sm ${
                                  processing 
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-green-500 text-white hover:bg-green-600'
                                }`}
                                title="現在の設定で再処理"
                              >
                                再処理
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => removeFile(file.id)}
                            className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ウォーターマーク設定 */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">ウォーターマーク設定</h2>
            
            <div className="space-y-4">
              {/* テキスト */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  テキスト
                </label>
                <input
                  type="text"
                  value={watermarkSettings.text}
                  onChange={(e) => setWatermarkSettings(prev => ({ ...prev, text: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* フォントサイズ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  フォントサイズ: {watermarkSettings.fontSize}px
                  {watermarkSettings.fontSize >= 400 ? (
                    <span className="text-xs text-orange-600 ml-2">（超高解像度用）</span>
                  ) : watermarkSettings.fontSize >= 200 ? (
                    <span className="text-xs text-blue-600 ml-2">（高解像度用）</span>
                  ) : null}
                </label>
                <input
                  type="range"
                  min="12"
                  max="500"
                  step="1"
                  value={watermarkSettings.fontSize}
                  onChange={(e) => {
                    const newValue = Number(e.target.value);
                    const adjustedValue = adjustFontSizeToStep(newValue);
                    setWatermarkSettings(prev => ({ ...prev, fontSize: adjustedValue }));
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>12px (小)</span>
                  <span>100px (標準)</span>
                  <span>200px (大)</span>
                  <span>500px (超大)</span>
                </div>
              </div>

              {/* フォント */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  フォント
                </label>
                <select
                  value={watermarkSettings.fontFamily}
                  onChange={(e) => setWatermarkSettings(prev => ({ ...prev, fontFamily: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Noto Sans JP">Noto Sans JP（日本語推奨）</option>
                  <option value="Roboto">Roboto（シンプル・現代的）</option>
                  <option value="Open Sans">Open Sans（見やすい・クリア）</option>
                </select>
              </div>

              {/* 位置 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  位置
                </label>
                <select
                  value={watermarkSettings.position}
                  onChange={(e) => setWatermarkSettings(prev => ({ ...prev, position: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="top-left">左上</option>
                  <option value="top-right">右上</option>
                  <option value="center">中央</option>
                  <option value="bottom-left">左下</option>
                  <option value="bottom-right">右下</option>
                </select>
              </div>

              {/* 透明度 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  透明度: {Math.round(watermarkSettings.opacity * 100)}%
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={watermarkSettings.opacity}
                  onChange={(e) => setWatermarkSettings(prev => ({ ...prev, opacity: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              {/* 色 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  色
                </label>
                <input
                  type="color"
                  value={watermarkSettings.color}
                  onChange={(e) => setWatermarkSettings(prev => ({ ...prev, color: e.target.value }))}
                  className="w-full h-10 border border-gray-300 rounded-md"
                />
              </div>

              {/* 影設定 */}
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={watermarkSettings.shadowEnabled}
                    onChange={(e) => setWatermarkSettings(prev => ({ ...prev, shadowEnabled: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">影を有効にする</span>
                </label>
              </div>

              {watermarkSettings.shadowEnabled && (
                <div className="pl-6 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      影の透明度: {Math.round(watermarkSettings.shadowOpacity * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      value={watermarkSettings.shadowOpacity}
                      onChange={(e) => setWatermarkSettings(prev => ({ ...prev, shadowOpacity: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        X軸: {watermarkSettings.shadowOffsetX}px
                      </label>
                      <input
                        type="range"
                        min="-10"
                        max="10"
                        value={watermarkSettings.shadowOffsetX}
                        onChange={(e) => setWatermarkSettings(prev => ({ ...prev, shadowOffsetX: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Y軸: {watermarkSettings.shadowOffsetY}px
                      </label>
                      <input
                        type="range"
                        min="-10"
                        max="10"
                        value={watermarkSettings.shadowOffsetY}
                        onChange={(e) => setWatermarkSettings(prev => ({ ...prev, shadowOffsetY: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 処理ボタン */}
            <div className="mt-6 space-y-3">
              <button
                onClick={processImages}
                disabled={uploadedFiles.length === 0 || processing || isInQueue}
                className={`w-full py-3 px-4 rounded-lg font-medium ${
                  uploadedFiles.length === 0 || processing || isInQueue
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                } transition-colors`}
              >
                {processing ? '処理中...' : isInQueue ? 'キュー待機中...' : 'ウォーターマークを適用'}
              </button>

              {uploadedFiles.some(f => f.processed) && (
                <div>
                  <button
                    onClick={downloadAllFiles}
                    className="w-full py-3 px-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
                  >
                    {(() => {
                      const processedFiles = uploadedFiles.filter(f => f.processed);
                      if (processedFiles.length === 1) {
                        return 'ダウンロード';
                      }
                      const downloadMethod = determineDownloadMethod(processedFiles);
                      return downloadMethod === 'ZIP' 
                        ? `ZIP一括ダウンロード (${processedFiles.length}ファイル)`
                        : `個別ダウンロード (${processedFiles.length}ファイル)`;
                    })()}
                  </button>
                  {(() => {
                    const processedFiles = uploadedFiles.filter(f => f.processed);
                    if (processedFiles.length > 1) {
                      const downloadMethod = determineDownloadMethod(processedFiles);
                      return (
                        <p className="text-xs text-gray-500 mt-1 text-center">
                          {downloadMethod === 'ZIP' 
                            ? '4MB以下のファイルはZIP形式でダウンロード'
                            : '4MB超過のため個別ダウンロード'}
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}