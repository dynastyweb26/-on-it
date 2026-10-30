// Browser checks that run against a deployed Vercel PREVIEW (never localhost,
// never production). BASE_URL is the preview's unique deployment URL.
// If the preview is behind Vercel Authentication, set VERCEL_AUTOMATION_BYPASS_SECRET
// (a GitHub Actions secret): the header below lets the runner in.
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL;
if (!baseURL) throw new Error('BASE_URL is required (the preview deployment URL).');
if (/(^|\/\/)(www\.)?onit\.dynastyweb\.co/.test(baseURL) && !process.env.E2E_ALLOW_PRODUCTION) {
  throw new Error('Refusing to run browser checks against production. Use a preview URL.');
}

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const chromiumPath = process.env.PW_CHROMIUM_PATH; // sandbox only: use a preinstalled Chromium

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    reducedMotion: 'reduce',
    extraHTTPHeaders: bypass
      ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' }
      : undefined,
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },
  projects: [
    { name: 'phone-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'laptop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
