import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: '#D4A017',
        'gold-light': '#E8C158',
        ink: '#141210',
        paper: '#FCFAF6',
        'paper-dim': '#F3EFE7',
        line: '#E5DFD2',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        card: '1.25rem',
      },
    },
  },
  plugins: [],
};
export default config;
