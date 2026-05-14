import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Alpaca Trading',
    short_name: 'Alpaca Trading',
    description: 'Portfolio tracking and trading for Alpaca',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    orientation: 'portrait',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}