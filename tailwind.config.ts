import type { Config } from 'tailwindcss';

// ═══ On It — Warm Premium tokens (Design Standard v1.0) ═══
// Source of truth: ON-IT-DESIGN-STANDARD.md + design/tailwind.config.snippet.js.
// Gold rule: primary (#735c00) = gold as TEXT/ICON on light surfaces;
// primary-container (#d4af37) = gold as FILL with dark text only;
// inverse-primary (#e9c349) = gold on dark surfaces. Never white on #d4af37.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#fff8f0',
        'on-background': '#1f1b13',
        surface: {
          DEFAULT: '#fff8f0',
          dim: '#e1d9cc',
          'container-lowest': '#ffffff',
          'container-low': '#fbf3e5',
          container: '#f5eddf',
          'container-high': '#efe7da',
          'container-highest': '#eae1d4',
          variant: '#eae1d4',
        },
        'on-surface': { DEFAULT: '#1f1b13', variant: '#4d4635' },
        inverse: { surface: '#343027', 'on-surface': '#f8f0e2', primary: '#e9c349' },
        outline: { DEFAULT: '#7f7663', variant: '#d0c5af' },
        primary: {
          DEFAULT: '#735c00',        // gold as TEXT/ICON on light surfaces
          container: '#d4af37',      // gold as FILL — dark text only, never white
          soft: '#f0e3b8',           // soft gold fill (composer +, camera, Chat tab at rest)
          'on-container': '#554300',
          fixed: '#ffe088',
          'fixed-dim': '#e9c349',
        },
        secondary: { DEFAULT: '#5f5e59', container: '#e5e2db', 'on-container': '#65645f' },
        tertiary: { DEFAULT: '#415ba4', container: '#97b0ff', 'on-container': '#254188' },
        error: { DEFAULT: '#ba1a1a', container: '#ffdad6', 'on-container': '#93000a' },
        paid: { DEFAULT: '#0f6d31', container: '#c9f2d4' },
        // Paywall surfaces and accents, taken from the design mockup
        // (design-reference/paywall-mockup.html). Gold stays a fill only.
        tile: '#faefdc',       // demo/table band, the mockup's warm card
        hairline: '#f0e7d8',   // 1px card and table rules
        dash: '#e6d9c3',       // dashed receipt divider, input border
        muted: '#a59a84',      // “not set”, disabled values
        reel: '#e3d6bf',       // deck dots, switch track off
        chip: '#f1e6d3',       // icon tile inside the mockup's cards
        positive: { DEFAULT: '#17703a', container: '#c9f0d5' },
        alert: '#a1321f',      // code-entry error
        sent: { DEFAULT: '#735c00', container: '#f3e9c8' },
        draft: { DEFAULT: '#474742', container: '#e5e2db' },
      },
      fontFamily: {
        display: ['var(--font-montserrat)', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'numeric-xl': ['40px', { lineHeight: '48px', fontWeight: '700' }],
        'headline-lg': ['24px', { lineHeight: '32px', fontWeight: '700' }],
        'headline-mobile': ['20px', { lineHeight: '28px', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '28px' }],
        'body-md': ['16px', { lineHeight: '24px' }],
        'label-lg': ['14px', { lineHeight: '20px', letterSpacing: '0.05em', fontWeight: '600' }],
      },
      borderRadius: {
        card: '20px',
        button: '9999px',
        input: '12px',
        chip: '8px',
      },
      spacing: {
        container: '24px',
        gutter: '16px',
        touch: '56px',
        row: '64px',
        fab: '72px',
      },
      boxShadow: {
        card: '0 4px 24px rgba(115, 92, 0, 0.08)',
        'card-raised': '0 8px 32px rgba(115, 92, 0, 0.10)',
      },
    },
  },
  plugins: [],
};
export default config;
