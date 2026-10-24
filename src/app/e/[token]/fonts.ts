// Public estimate page fonts — loaded by this route only.
//
// Montserrat (headings/totals) is already self-hosted by the root layout as
// --font-montserrat; this route reuses that variable rather than shipping a
// second copy of the same file. DM Sans (body), Allura (typed signature) and
// the Rounded icon subset are new here and are imported ONLY by
// app/e/[token]/page.tsx, so no other route downloads them.
//
// Self-hosted like the app fonts (see app/layout.tsx): next/font/google fetches
// the CSS from Google at build time and once shipped one font version in the
// HTML and another in the CSS. Local files make the class names come from the
// repo.
import localFont from 'next/font/local';

export const dmSans = localFont({
  src: '../../../fonts/dm-sans-latin-variable.woff2',
  variable: '--font-dm-sans',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
});

export const allura = localFont({
  src: '../../../fonts/allura-latin-400.woff2',
  variable: '--font-allura',
  weight: '400',
  style: 'normal',
  display: 'swap',
});

export const estimateSymbols = localFont({
  src: '../../../fonts/material-symbols-rounded.woff2',
  variable: '--font-est-symbols',
  weight: '400',
  style: 'normal',
  display: 'block',
  // An icon font has no metric-compatible fallback — never synthesize one.
  adjustFontFallback: false,
});

export const estimateFontClassName = `${dmSans.variable} ${allura.variable} ${estimateSymbols.variable}`;
