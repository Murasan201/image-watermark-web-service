import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

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

export async function POST(request: NextRequest) {
  try {
    // Content-Lengthヘッダーをチェック（Vercel制限: 4.5MB）
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 4.5 * 1024 * 1024) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'アップロードサイズが制限を超えています（最大4.5MB）',
          code: 'REQUEST_TOO_LARGE'
        },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const settingsJson = formData.get('settings') as string;
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, message: 'ファイルが指定されていません' },
        { status: 400 }
      );
    }

    if (!settingsJson) {
      return NextResponse.json(
        { success: false, message: 'ウォーターマーク設定が指定されていません' },
        { status: 400 }
      );
    }

    const settings: WatermarkSettings = JSON.parse(settingsJson);
    
    // デバッグログ
    console.log('Server processing started:', {
      fileCount: files.length,
      totalSize: `${(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2)}MB`,
      settings: {
        text: settings.text,
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily,
        position: settings.position,
        opacity: settings.opacity,
        color: settings.color,
        shadowEnabled: settings.shadowEnabled
      }
    });

    // ファイル数・サイズ検証
    if (files.length > 5) {
      return NextResponse.json(
        { success: false, message: 'ファイル数は最大5個までです' },
        { status: 400 }
      );
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxTotalSize = 4.5 * 1024 * 1024; // 4.5MB (Vercel制限)

    if (totalSize > maxTotalSize) {
      return NextResponse.json(
        { success: false, message: 'ファイルの総サイズが4.5MBを超えています' },
        { status: 400 }
      );
    }

    // 各ファイルの処理
    const processedFiles: Array<{
      originalName: string;
      processedBuffer: Buffer;
      mimeType: string;
    }> = [];

    for (const file of files) {
      // ファイル形式チェック
      if (!file.type.includes('image/jpeg')) {
        return NextResponse.json(
          { success: false, message: `${file.name}: .jpg/.jpeg ファイルのみ対応しています` },
          { status: 400 }
        );
      }

      // ファイルサイズチェック
      if (file.size > 3 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, message: `${file.name}: ファイルサイズが3MBを超えています` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      
      console.log(`Processing file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      
      try {
        const processedBuffer = await applyWatermarkSharp(buffer, settings, file.name);
        processedFiles.push({
          originalName: file.name,
          processedBuffer,
          mimeType: 'image/jpeg'
        });
        console.log(`Successfully processed: ${file.name}`);
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        return NextResponse.json(
          { success: false, message: `${file.name} の処理に失敗しました: ${error}` },
          { status: 500 }
        );
      }
    }

    // 処理済みファイルをBase64エンコードして返却
    const result = processedFiles.map(file => ({
      originalName: file.originalName,
      processedDataUrl: `data:${file.mimeType};base64,${file.processedBuffer.toString('base64')}`,
      size: file.processedBuffer.length
    }));

    return NextResponse.json({
      success: true,
      processedFiles: result,
      totalSize: result.reduce((sum, file) => sum + file.size, 0)
    });

  } catch (error) {
    console.error('Image processing error:', error);
    return NextResponse.json(
      { success: false, message: '画像処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

async function applyWatermarkSharp(
  imageBuffer: Buffer, 
  settings: WatermarkSettings,
  fileName?: string
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  
  if (!metadata.width || !metadata.height) {
    throw new Error('画像のメタデータを取得できませんでした');
  }

  console.log(`Image metadata for ${fileName}:`, {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    channels: metadata.channels
  });

  // ウォーターマークテキストのSVGを生成
  const watermarkSvg = await generateWatermarkSvg(
    settings, 
    metadata.width, 
    metadata.height,
    fileName
  );

  // ウォーターマークを画像に合成
  try {
    console.log(`Compositing watermark for ${fileName}...`);
    const result = await image
      .composite([{
        input: Buffer.from(watermarkSvg, 'utf8'),
        top: 0,
        left: 0,
        blend: 'over'
      }])
      .jpeg({ quality: 90 })
      .toBuffer();

    console.log(`Watermark applied successfully for ${fileName}, output size: ${result.length} bytes`);
    return result;
  } catch (compositeError) {
    console.error(`Composite error for ${fileName}:`, compositeError);
    throw new Error(`ウォーターマーク合成に失敗しました: ${compositeError}`);
  }
}

async function generateWatermarkSvg(
  settings: WatermarkSettings,
  imageWidth: number,
  imageHeight: number,
  fileName?: string
): Promise<string> {
  // テキストサイズを計算（日本語・英語対応の改善）
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(settings.text);
  const charWidth = hasJapanese ? settings.fontSize * 1.0 : settings.fontSize * 0.6;
  const textWidth = settings.text.length * charWidth;
  const padding = Math.max(40, settings.fontSize * 0.8); // パディングを増加

  // 位置計算（中央配置の改善）
  let x: number, y: number;
  switch (settings.position) {
    case 'top-left':
      x = padding;
      y = settings.fontSize + padding;
      break;
    case 'top-right':
      x = imageWidth - textWidth - padding;
      y = settings.fontSize + padding;
      break;
    case 'center':
      x = (imageWidth - textWidth) / 2;
      y = imageHeight / 2 + settings.fontSize / 3; // ベースライン調整
      break;
    case 'bottom-left':
      x = padding;
      y = imageHeight - padding;
      break;
    case 'bottom-right':
    default:
      x = imageWidth - textWidth - padding;
      y = imageHeight - padding;
      break;
  }

  // 座標の境界チェック（改善）
  x = Math.max(padding, Math.min(x, imageWidth - textWidth - padding));
  y = Math.max(settings.fontSize + padding, Math.min(y, imageHeight - padding));

  // デバッグログ
  console.log(`SVG generation for ${fileName}:`, {
    imageSize: `${imageWidth}x${imageHeight}`,
    fontSize: settings.fontSize,
    textWidth,
    calculatedPosition: `(${x}, ${y})`,
    requestedPosition: settings.position,
    text: `"${settings.text}"`,
    fontFamily: getFontFamily(settings.fontFamily),
    hasJapanese,
    padding
  });

  // SVG定義部分
  const defs = settings.shadowEnabled 
    ? `<defs>
         <filter id="textShadow" x="-50%" y="-50%" width="200%" height="200%">
           <feDropShadow dx="${settings.shadowOffsetX}" dy="${settings.shadowOffsetY}" 
                        stdDeviation="1" flood-color="black" flood-opacity="${settings.shadowOpacity}"/>
         </filter>
       </defs>`
    : '';

  // フォント指定の改善（Web安全フォント）
  const fontFamily = getFontFamily(settings.fontFamily);
  
  // テキスト要素
  const textElement = `
    <text x="${x}" y="${y}" 
          font-family="${fontFamily}" 
          font-size="${settings.fontSize}px" 
          font-weight="normal"
          fill="${settings.color}" 
          fill-opacity="${settings.opacity}"
          text-anchor="start"
          dominant-baseline="alphabetic"
          ${settings.shadowEnabled ? 'filter="url(#textShadow)"' : ''}>
      ${escapeXml(settings.text)}
    </text>
  `;

  // 完全なSVG
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${imageWidth}" height="${imageHeight}" 
     viewBox="0 0 ${imageWidth} ${imageHeight}"
     xmlns="http://www.w3.org/2000/svg">
  ${defs}
  ${textElement}
</svg>`;

  console.log(`Generated SVG for ${fileName}:`, svg.substring(0, 200) + '...');

  return svg;
}

function getFontFamily(fontFamily: string): string {
  // フォント名をサーバー環境で利用可能なものにマッピング
  const fontMap: { [key: string]: string } = {
    'Arial': 'Arial, sans-serif',
    'Georgia': 'Georgia, serif', 
    'Times New Roman': 'Times, serif',
    'Helvetica': 'Helvetica, Arial, sans-serif'
  };
  
  return fontMap[fontFamily] || 'Arial, sans-serif';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}