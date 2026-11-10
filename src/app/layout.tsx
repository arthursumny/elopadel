import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Elo Padel — sua carreira começa na quadra',
  description: 'Partidas equilibradas, ranking contínuo e evolução competitiva para jogadores de padel.',
  applicationName: 'Elo Padel',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/brand/apple-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'Elo Padel',
    description: 'Partidas equilibradas, ranking contínuo e evolução competitiva para jogadores de padel.',
    images: ['/brand/logo-512.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#090b10',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${geist.variable} ${geistMono.variable}`}>{children}<div className="noise" aria-hidden="true" /></body></html>;
}
