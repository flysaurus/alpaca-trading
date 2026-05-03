import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kilimanjaro Training Dashboard',
    short_name: 'Kili Dash',
    description: 'Track your fitness journey to the summit of Kilimanjaro',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#f59e0b',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-512.jpg',
        sizes: '192x192 512x512',
        type: 'image/jpeg',
      },
    ],
  }
}