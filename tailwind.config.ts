import type { Config } from 'tailwindcss';
import containerQueries from '@tailwindcss/container-queries';

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
        // Ledger card sheet (design token "sheet" #FFFDF8): the warm-white body
        // the draft / sent / ready cards are printed on.
        sheet: '#fffdf8',
        secondary: { DEFAULT: '#5f5e59', container: '#e5e2db', 'on-container': '#65645f' },
        tertiary: { DEFAULT: '#415ba4', container: '#97b0ff', 'on-container': '#254188' },
        error: { DEFAULT: '#ba1a1a', container: '#ffdad6', 'on-container': '#93000a' },
        paid: { DEFAULT: '#0f6d31', container: '#c9f2d4' },
        sent: { DEFAULT: '#735c00', container: '#f3e9c8' },
        draft: { DEFAULT: '#474742', container: '#e5e2db' },
      },
      fontFamily: {
        display: ['var(--font-montserrat)', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        // Ledger card meta (line numbers, links, document IDs). System mono: the
        // design's JetBrains Mono would be a second webfont for ~20 characters.
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
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
        // On It Chat (docs/design/onit-chat · Tokens): line-item name, caps
        // labels above a total, and the mono meta line under a locked item.
        'item-md': ['17px', { lineHeight: '20px' }],
        caps: ['12px', { lineHeight: '16px', letterSpacing: '0.1em', fontWeight: '700' }],
        meta: ['13px', { lineHeight: '18px' }],
      },
      borderRadius: {
        card: '20px',
        button: '9999px',
        input: '12px',
        chip: '8px',
        // Ledger card: the sheet (18), its controls (10) and fields (8).
        ledger: '18px',
        control: '10px',
        field: '8px',
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
        // Ledger card (design tokens: card-rest, card-lift, menu). Neutral ink,
        // not gold: the warm-white sheet is lifted by a soft shadow.
        ledger: '0 1px 2px rgba(31, 27, 19, 0.06), 0 12px 28px -18px rgba(31, 27, 19, 0.28)',
        'ledger-lift': '0 4px 8px rgba(31, 27, 19, 0.10), 0 24px 48px -18px rgba(31, 27, 19, 0.38)',
        menu: '0 12px 32px -10px rgba(31, 27, 19, 0.35)',
      },
      // On It Chat motion (design: 140 / 260 / 600). The CSS custom properties in
      // globals.css mirror these; use whichever side a component already speaks.
      transitionDuration: {
        tap: '140ms',
        settle: '260ms',
        hero: '600ms',
      },
      transitionTimingFunction: {
        settle: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
      },
    },
  },
  // Container queries (@container, @xl:, @4xl:): grids size by the room their
  // page actually gets (viewport minus the sidebar/rail), not by the viewport.
  plugins: [containerQueries],
};
export default config;
