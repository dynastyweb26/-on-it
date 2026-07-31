/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production';

// CSP scoped to the origins the app actually uses:
//  - Supabase (REST + realtime wss + storage images)
//  - Google Fonts (Material Symbols stylesheet + gstatic woff2)
//  - Stripe (js.stripe.com) — ready for the July 17 paywall merge
// Anthropic and AssemblyAI are server-side only, so no browser origin needed.
// 'unsafe-inline' scripts remain (Next injects inline bootstrap without a
// nonce); 'unsafe-eval' is dev-only (react-refresh). Nonce-based hardening is
// a documented follow-up in SECURITY-AUDIT.md.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.stripe.com`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com`,
  `img-src 'self' data: blob: https://*.supabase.co`,
  // Stripe.js (July 17 paywall) calls api.stripe.com and posts telemetry to
  // r./m.stripe.com — all XHR/fetch, so they must be in connect-src, not just
  // script-src/frame-src. Without these, Stripe.js fails silently in-browser.
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://r.stripe.com https://m.stripe.com`,
  `frame-src https://js.stripe.com https://*.stripe.com`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  // Legal documents (privacy-policy.md / terms-of-service.md) are imported as
  // raw strings and rendered by src/components/Markdown.tsx. Runs in dev and
  // prod builds identically, so the .md is always bundled — no fs/tracing.
  webpack: (config) => {
    config.module.rules.push({ test: /\.md$/, type: 'asset/source' });
    return config;
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), geolocation=()' },
      ],
    },
  ],
};
export default nextConfig;
