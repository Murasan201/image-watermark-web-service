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

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`=== Processing file ${i + 1}/${files.length}: ${file.name} ===`);
      
      // ファイル形式チェック
      if (!file.type.includes('image/jpeg')) {
        console.error(`File type error: ${file.type}`);
        return NextResponse.json(
          { success: false, message: `${file.name}: .jpg/.jpeg ファイルのみ対応しています` },
          { status: 400 }
        );
      }

      // ファイルサイズチェック
      if (file.size > 3 * 1024 * 1024) {
        console.error(`File size error: ${file.size} bytes`);
        return NextResponse.json(
          { success: false, message: `${file.name}: ファイルサイズが3MBを超えています` },
          { status: 400 }
        );
      }

      console.log(`File validation passed: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB, ${file.type})`);
      
      let buffer;
      try {
        buffer = Buffer.from(await file.arrayBuffer());
        console.log(`Buffer created: ${buffer.length} bytes`);
      } catch (bufferError) {
        console.error(`Buffer creation failed for ${file.name}:`, bufferError);
        return NextResponse.json(
          { success: false, message: `${file.name} のバッファ作成に失敗しました` },
          { status: 500 }
        );
      }
      
      try {
        console.log(`Starting watermark application for: ${file.name}`);
        const processedBuffer = await applyWatermarkSharp(buffer, settings, file.name);
        processedFiles.push({
          originalName: file.name,
          processedBuffer,
          mimeType: 'image/jpeg'
        });
        console.log(`✅ Successfully processed: ${file.name} -> ${processedBuffer.length} bytes`);
      } catch (error) {
        console.error(`❌ Server processing failed for ${file.name}:`, error);
        console.log(`⚠️ Falling back to client-side processing recommendation for ${file.name}`);
        
        // サーバー処理失敗時は、処理なしの元画像を返却（クライアント処理推奨）
        processedFiles.push({
          originalName: file.name,
          processedBuffer: buffer, // 元画像をそのまま返却
          mimeType: 'image/jpeg'
        });
        console.log(`📤 Returning original image for client-side processing: ${file.name}`);
      }
    }

    // 処理済みファイルをBase64エンコードして返却
    const result = processedFiles.map(file => ({
      originalName: file.originalName,
      processedDataUrl: `data:${file.mimeType};base64,${file.processedBuffer.toString('base64')}`,
      size: file.processedBuffer.length
    }));

    console.log(`🎯 Batch processing completed: ${processedFiles.length} files processed`);

    return NextResponse.json({
      success: true,
      processedFiles: result,
      totalSize: result.reduce((sum, file) => sum + file.size, 0),
      message: `${processedFiles.length}個のファイルを処理しました`,
      fallbackToClient: false // サーバー処理が成功
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

  // シンプルなテキストオーバーレイを使用（フォント依存回避）
  try {
    console.log(`Creating simple text overlay for ${fileName}...`);
    
    // 位置計算
    const textWidth = settings.text.length * settings.fontSize * 0.6; // 概算
    const padding = Math.max(40, settings.fontSize * 0.8);
    
    let x: number, y: number;
    switch (settings.position) {
      case 'top-left':
        x = padding;
        y = padding;
        break;
      case 'top-right':
        x = metadata.width - textWidth - padding;
        y = padding;
        break;
      case 'center':
        x = (metadata.width - textWidth) / 2;
        y = (metadata.height - settings.fontSize) / 2;
        break;
      case 'bottom-left':
        x = padding;
        y = metadata.height - settings.fontSize - padding;
        break;
      case 'bottom-right':
      default:
        x = metadata.width - textWidth - padding;
        y = metadata.height - settings.fontSize - padding;
        break;
    }
    
    // 境界チェック
    x = Math.max(padding, Math.min(x, metadata.width - textWidth - padding));
    y = Math.max(padding, Math.min(y, metadata.height - settings.fontSize - padding));
    
    console.log(`Text position for ${fileName}:`, { x, y, textWidth, fontSize: settings.fontSize });
    
    // RGB色をHex色に変換
    const color = settings.color.replace('#', '');
    const opacity = Math.round(settings.opacity * 255);
    
    // 半透明のカラーオーバーレイを作成
    const textHeight = settings.fontSize;
    const overlayWidth = Math.min(textWidth + padding * 2, metadata.width);
    const overlayHeight = Math.min(textHeight + padding, metadata.height);
    
    const textOverlay = await sharp({
      create: {
        width: Math.round(overlayWidth),
        height: Math.round(overlayHeight),
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .png()
    .toBuffer();
    
    const result = await image
      .composite([{
        input: textOverlay,
        top: Math.round(y),
        left: Math.round(x),
        blend: 'over'
      }])
      .jpeg({ quality: 90 })
      .toBuffer();

    console.log(`Simple overlay applied for ${fileName}, output size: ${result.length} bytes`);
    return result;
    
  } catch (overlayError) {
    console.error(`Text overlay error for ${fileName}:`, overlayError);
    throw new Error(`テキストオーバーレイ作成に失敗しました: ${overlayError}`);
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
  
  // テキストの高さを考慮した計算
  const textHeight = settings.fontSize;
  
  switch (settings.position) {
    case 'top-left':
      x = padding;
      y = textHeight + padding;
      break;
    case 'top-right':
      x = imageWidth - textWidth - padding;
      y = textHeight + padding;
      break;
    case 'center':
      x = imageWidth / 2; // text-anchor="middle"を使用するため中央座標
      y = imageHeight / 2; // 中央配置を正確に
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

  // 座標の境界チェック（中央配置は境界チェックなし）
  if (settings.position === 'center') {
    // 中央配置の場合は境界チェックしない（そのまま中央座標を使用）
    console.log(`Center position - no boundary check: x=${x}, y=${y}`);
  } else {
    const minX = padding;
    const maxX = Math.max(minX, imageWidth - textWidth - padding);
    const minY = textHeight + padding;
    const maxY = imageHeight - padding;
    
    const originalX = x;
    const originalY = y;
    x = Math.max(minX, Math.min(x, maxX));
    y = Math.max(minY, Math.min(y, maxY));
    
    console.log(`Boundary check: (${originalX},${originalY}) -> (${x},${y})`);
  }
  
  console.log(`Position calculation details for ${fileName}:`, {
    originalPosition: settings.position,
    textWidth,
    textHeight,
    imageSize: `${imageWidth}x${imageHeight}`,
    calculated: { x, y },
    bounds: { minX, maxX, minY, maxY },
    padding
  });

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
  
  // テキスト要素（中央配置の場合はtext-anchorを調整）
  const textAnchor = settings.position === 'center' ? 'middle' : 'start';
  const dominantBaseline = settings.position === 'center' ? 'central' : 'alphabetic';
  
  const textElement = `
    <text x="${x}" y="${y}" 
          font-family="${fontFamily}" 
          font-size="${settings.fontSize}px" 
          font-weight="normal"
          fill="${settings.color}" 
          fill-opacity="${settings.opacity}"
          text-anchor="${textAnchor}"
          dominant-baseline="${dominantBaseline}"
          ${settings.shadowEnabled ? 'filter="url(#textShadow)"' : ''}>
      ${escapeXml(settings.text)}
    </text>
  `;
  
  console.log(`Text element attributes for ${fileName}:`, {
    x, y,
    textAnchor,
    dominantBaseline,
    fontSize: settings.fontSize,
    text: settings.text
  });

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
  // Vercel/Linux環境で確実に利用可能なフォント
  const fontMap: { [key: string]: string } = {
    'Arial': 'DejaVu Sans, Arial, sans-serif',
    'Georgia': 'DejaVu Serif, Georgia, serif', 
    'Times New Roman': 'DejaVu Serif, Times, serif',
    'Helvetica': 'DejaVu Sans, Helvetica, Arial, sans-serif'
  };
  
  return fontMap[fontFamily] || 'DejaVu Sans, sans-serif';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}