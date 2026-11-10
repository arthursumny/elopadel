import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Elo Padel',
    short_name: 'Elo Padel',
    description: 'Sua carreira competitiva de padel.',
    start_url: '/',
    display: 'standalone',
    background_color: '#090b10',
    theme_color: '#090b10',
    icons: [
      { src: '/brand/logo-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/logo-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
