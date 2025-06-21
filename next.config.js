/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
  },
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  // Vercel Function制限に合わせたアップロード制限
  serverRuntimeConfig: {
    // 本番環境ではVercelの制限に従う
    maxBodySize: process.env.NODE_ENV === 'production' ? '4.5mb' : '50mb',
  },
}

module.exports = nextConfig