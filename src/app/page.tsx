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

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await fetch('/api/auth/session', { method: 'DELETE' });
      router.push('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
    }
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

    // 総計15MB以下
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
        setError(error);
        return;
      }
    }

    // 既存ファイルとの組み合わせチェック
    const allFiles = [...uploadedFiles.map(uf => uf.file), ...fileArray];
    const validationError = validateFileSet(allFiles);
    if (validationError) {
      setError(validationError);
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
    setError(null);
  };

  const processImages = async () => {
    if (uploadedFiles.length === 0) {
      setError('処理する画像がありません');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // 自動振り分けロジック
      const totalSize = uploadedFiles.reduce((sum, file) => sum + file.file.size, 0);
      const fileCount = uploadedFiles.length;
      
      let processingMethod: 'CLIENT' | 'SERVER';
      
      // Canvas API（クライアント処理）条件
      if (fileCount === 1 && uploadedFiles[0].file.size <= 1.5 * 1024 * 1024) {
        processingMethod = 'CLIENT';
      } 
      // サーバー処理条件（2-5ファイル かつ 総計15MB以下）
      else if (fileCount >= 2 && fileCount <= 5 && totalSize <= 15 * 1024 * 1024) {
        processingMethod = 'SERVER';
      } 
      // 1ファイルで1.5MB超過の場合もサーバー処理
      else if (fileCount === 1 && uploadedFiles[0].file.size > 1.5 * 1024 * 1024 && totalSize <= 15 * 1024 * 1024) {
        processingMethod = 'SERVER';
      }
      // 制限超過
      else {
        throw new Error('ファイルサイズまたは数が制限を超えています');
      }

      if (processingMethod === 'CLIENT') {
        // クライアントサイド処理 (Canvas API)
        await processImagesClient();
      } else {
        // サーバーサイド処理 (Sharp + Node.js)
        await processImagesServer();
      }
    } catch (error) {
      console.error('Image processing failed:', error);
      setError(error instanceof Error ? error.message : '画像処理に失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  const processImagesClient = async () => {
    const processedFiles: UploadedFile[] = [];

    for (const uploadedFile of uploadedFiles) {
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
        throw new Error(`${uploadedFile.file.name} の処理に失敗しました`);
      }
    }

    setUploadedFiles(processedFiles);
  };

  const processImagesServer = async () => {
    const formData = new FormData();
    
    // ファイルを追加
    uploadedFiles.forEach(uploadedFile => {
      formData.append('files', uploadedFile.file);
    });
    
    // ウォーターマーク設定を追加
    formData.append('settings', JSON.stringify(watermarkSettings));

    try {
      const response = await fetch('/api/process-images', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'サーバー処理に失敗しました');
      }

      // 処理済み画像をファイルリストに反映
      const processedFiles: UploadedFile[] = uploadedFiles.map((uploadedFile, index) => {
        const processedFile = result.processedFiles[index];
        
        // 既存の処理済み画像URLがあれば解放
        if (uploadedFile.processed) {
          URL.revokeObjectURL(uploadedFile.processed);
        }

        return {
          ...uploadedFile,
          processed: processedFile.processedDataUrl,
          isShowingProcessed: true
        };
      });

      setUploadedFiles(processedFiles);
      
    } catch (error) {
      console.error('Server processing failed:', error);
      throw new Error(error instanceof Error ? error.message : 'サーバー処理に失敗しました');
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

  const getFontSizeStep = (currentValue: number): number => {
    // スマートステップ計算
    if (currentValue <= 50) {
      return 1;  // 12-50px: 1px刻み（細かい調整）
    } else if (currentValue <= 100) {
      return 2;  // 50-100px: 2px刻み（標準）
    } else if (currentValue <= 200) {
      return 5;  // 100-200px: 5px刻み（大きいサイズ）
    } else {
      return 10; // 200-500px: 10px刻み（特大サイズ）
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
      // 自動振り分けロジック（1ファイルのみの再処理）
      let processedUrl: string;
      
      if (file.file.size <= 1.5 * 1024 * 1024) {
        // クライアント処理
        processedUrl = await applyWatermarkCanvas(file.file, watermarkSettings);
      } else {
        // サーバー処理
        const formData = new FormData();
        formData.append('files', file.file);
        formData.append('settings', JSON.stringify(watermarkSettings));

        const response = await fetch('/api/process-images', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || 'サーバー処理に失敗しました');
        }

        processedUrl = result.processedFiles[0].processedDataUrl;
      }
      
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ファイルアップロード */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4">ファイルアップロード</h2>
              
              {/* ドラッグ&ドロップエリア */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
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
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-700">{error}</p>
                </div>
              )}

              {/* アップロードファイル一覧 */}
              {uploadedFiles.length > 0 && (
                <div className="mt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">アップロード済みファイル ({uploadedFiles.length}/5)</h3>
                    <button
                      onClick={clearAllFiles}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      すべて削除
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {uploadedFiles.map(file => (
                      <div key={file.id} className="p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
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
                        
                        <div className="flex space-x-2 mt-3">
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
                disabled={uploadedFiles.length === 0 || processing}
                className={`w-full py-3 px-4 rounded-lg font-medium ${
                  uploadedFiles.length === 0 || processing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                } transition-colors`}
              >
                {processing ? '処理中...' : 'ウォーターマークを適用'}
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