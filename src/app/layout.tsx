import type { Metadata } from 'next'
import { Noto_Sans_JP, Open_Sans, Roboto } from 'next/font/google'
import './globals.css'

// Google Fonts設定
const notoSansJP = Noto_Sans_JP({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

const openSans = Open_Sans({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: 'Image Watermark Service',
  description: 'Add watermarks to your images',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={`${notoSansJP.className} ${openSans.className} ${roboto.className}`}>
      <body>{children}</body>
    </html>
  )
}