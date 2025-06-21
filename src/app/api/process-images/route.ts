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
    console.log('Server processing with settings:', {
      text: settings.text,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      position: settings.position,
      opacity: settings.opacity,
      color: settings.color,
      shadowEnabled: settings.shadowEnabled
    });

    // ファイル数・サイズ検証
    if (files.length > 5) {
      return NextResponse.json(
        { success: false, message: 'ファイル数は最大5個までです' },
        { status: 400 }
      );
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxTotalSize = 15 * 1024 * 1024; // 15MB

    if (totalSize > maxTotalSize) {
      return NextResponse.json(
        { success: false, message: 'ファイルの総サイズが15MBを超えています' },
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
      
      try {
        const processedBuffer = await applyWatermarkSharp(buffer, settings);
        processedFiles.push({
          originalName: file.name,
          processedBuffer,
          mimeType: 'image/jpeg'
        });
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        return NextResponse.json(
          { success: false, message: `${file.name} の処理に失敗しました` },
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
  settings: WatermarkSettings
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  
  if (!metadata.width || !metadata.height) {
    throw new Error('画像のメタデータを取得できませんでした');
  }

  // ウォーターマークテキストのSVGを生成
  const watermarkSvg = await generateWatermarkSvg(
    settings, 
    metadata.width, 
    metadata.height
  );

  // ウォーターマークを画像に合成
  const result = await image
    .composite([{
      input: Buffer.from(watermarkSvg),
      top: 0,
      left: 0,
    }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return result;
}

async function generateWatermarkSvg(
  settings: WatermarkSettings,
  imageWidth: number,
  imageHeight: number
): Promise<string> {
  // テキストサイズを計算（より正確な計算）
  const charWidth = settings.fontSize * 0.6; // 文字幅の概算
  const textWidth = settings.text.length * charWidth;
  const padding = Math.max(20, settings.fontSize * 0.5); // フォントサイズに応じたパディング

  // 位置計算
  let x: number, y: number;
  switch (settings.position) {
    case 'top-left':
      x = padding;
      y = settings.fontSize + padding;
      break;
    case 'top-right':
      x = Math.max(padding, imageWidth - textWidth - padding);
      y = settings.fontSize + padding;
      break;
    case 'center':
      x = Math.max(0, (imageWidth - textWidth) / 2);
      y = (imageHeight + settings.fontSize) / 2;
      break;
    case 'bottom-left':
      x = padding;
      y = imageHeight - padding;
      break;
    case 'bottom-right':
    default:
      x = Math.max(padding, imageWidth - textWidth - padding);
      y = imageHeight - padding;
      break;
  }

  // 座標の境界チェック
  x = Math.max(0, Math.min(x, imageWidth - textWidth));
  y = Math.max(settings.fontSize, Math.min(y, imageHeight));

  // デバッグログ
  console.log('SVG generation:', {
    imageSize: `${imageWidth}x${imageHeight}`,
    fontSize: settings.fontSize,
    textWidth,
    position: `(${x}, ${y})`,
    text: settings.text
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

  // テキスト要素
  const textElement = `
    <text x="${x}" y="${y}" 
          font-family="${settings.fontFamily}" 
          font-size="${settings.fontSize}px" 
          font-weight="normal"
          fill="${settings.color}" 
          fill-opacity="${settings.opacity}"
          ${settings.shadowEnabled ? 'filter="url(#textShadow)"' : ''}
          dominant-baseline="alphabetic">
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
    </svg>
  `;

  return svg;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}