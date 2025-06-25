import { NextResponse } from 'next/server';
import sharp from 'sharp';

export async function GET() {
  try {
    // Sharpライブラリの基本動作テスト
    const testBuffer = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
      // ... 最小限のJPEGヘッダー
    ]);

    // 1x1ピクセルの最小限JPEG画像を生成
    const minimalJpeg = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
    .jpeg()
    .toBuffer();

    // SVGテキストを合成テスト
    const testSvg = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <text x="10" y="50" font-family="Arial" font-size="12" fill="red">
          TEST
        </text>
      </svg>
    `;

    const processedBuffer = await sharp(minimalJpeg)
      .composite([{
        input: Buffer.from(testSvg),
        top: 0,
        left: 0,
      }])
      .jpeg({ quality: 90 })
      .toBuffer();

    return NextResponse.json({
      success: true,
      message: 'Sharp処理テスト成功',
      sharpVersion: sharp.versions,
      originalSize: minimalJpeg.length,
      processedSize: processedBuffer.length,
      testImage: `data:image/jpeg;base64,${processedBuffer.toString('base64')}`
    });

  } catch (error: any) {
    console.error('Sharp test error:', error);
    return NextResponse.json({
      success: false,
      message: 'Sharp処理テスト失敗',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}