import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Family Calendar',
    short_name: 'FamCal',
    description: 'Ứng dụng lịch và quản lý gia đình',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4f46e5',
    icons: [
      {
        src: '/icon.svg',
        sizes: '192x192 512x512 any',
        type: 'image/svg+xml',
        purpose: 'maskable'
      }
    ],
  }
}
