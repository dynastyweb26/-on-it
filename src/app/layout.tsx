import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree, DM_Mono } from 'next/font/google';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display' });
const body = Figtree({ subsets: ['latin'], variable: '--font-body' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'On It — Invoices done by talking',
  description: 'Speak your job. Get a branded invoice. Get paid.',
  manifest: '/manifest.json',
};
export const viewport: Viewport = {
  themeColor: '#D4A017',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
