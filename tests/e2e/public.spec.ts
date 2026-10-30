// Signed-out pages only: safe on any preview because nothing here signs in or
// writes data (previews and production share one database).
import { test, expect } from '@playwright/test';
import { FORBIDDEN, collectProblems, visibleCopy } from './helpers';

const PAGES = ['/login', '/terms', '/privacy'];

for (const path of PAGES) {
  test(`${path}: loads, no retired "quote" copy, no errors`, async ({ page }, info) => {
    const problems = collectProblems(page);
    const res = await page.goto(path, { waitUntil: 'networkidle' });
    expect(res?.status(), `${path} status`).toBeLessThan(400);

    const leaks = (await visibleCopy(page)).filter((s) => FORBIDDEN.test(s));
    expect(leaks, `"quote" copy on ${path} (${info.project.name})`).toEqual([]);
    expect(problems, `errors on ${path} (${info.project.name})`).toEqual([]);
  });
}

test('the terms page uses the estimate wording', async ({ page }) => {
  await page.goto('/terms', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText(/estimate/i);
});
