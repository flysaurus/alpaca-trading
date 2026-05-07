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
    icons: [],
  }
}