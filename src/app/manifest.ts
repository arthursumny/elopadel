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
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
