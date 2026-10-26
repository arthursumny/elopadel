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
};

export const viewport: Viewport = {
  themeColor: '#090b10',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${geist.variable} ${geistMono.variable}`}>{children}<div className="noise" aria-hidden="true" /></body></html>;
}
