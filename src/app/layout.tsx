import type { Metadata, Viewport } from 'next';
import { Montserrat, Inter } from 'next/font/google';
import Splash from '@/components/Splash';
import './globals.css';

// Warm Premium dual-font strategy (Design Standard §3):
// Montserrat 700/800 — headlines, financial figures, wordmark.
// Inter 400/600 — body, labels, data. Nothing else.
const montserrat = Montserrat({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-montserrat' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-inter' });
// Material Symbols Outlined — the app's only icon system (§4). Not available
// in next/font on Next 14, so loaded via the Google Fonts stylesheet
// (display=swap) per the Migration Plan fallback.

export const metadata: Metadata = {
  title: 'On It — Invoices done by talking',
  description: 'Speak your job. Get a branded invoice. Get paid.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/icons/icon-180.png',
  },
};
export const viewport: Viewport = {
  themeColor: '#d4af37',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${inter.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
        {/* Chrome fires `beforeinstallprompt` very early — often before React
            hydrates and the /install hook can attach its listener. This head
            script runs during parse, captures the event, prevents the mini-
            infobar, and stashes it on window so useInstallPrompt can adopt it on
            mount (its own listener still handles a late/second fire). Inline is
            allowed by the CSP's script-src 'unsafe-inline'. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.__deferredInstallPrompt=null;" +
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__deferredInstallPrompt=e;});" +
              "window.addEventListener('appinstalled',function(){window.__deferredInstallPrompt=null;});",
          }}
        />
      </head>
      <body>
        <Splash />
        {children}
      </body>
    </html>
  );
}
