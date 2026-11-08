// D1 (P-06 / P-93) on a deployed PREVIEW — signed in, and it writes data, so it
// runs only when E2E_AUTHED is set (ZZ Test Seller only; nothing printed).
//
// One throwaway draft per run, created through the same chat tap the P-66 spec
// uses: the send POST is aborted, "Keep as draft" leaves the draft behind, and
// the run then deletes that same draft. It is soft-deleted (deleted_at), never
// erased, and the spec leaves no row on the list.
//
// Phone only: this round has no laptop layout for the sheet.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const SHOTS = path.join('tests', 'e2e', 'screenshots');
const SEND = '**/api/invoices/*/send';
const PATCH_INVOICES = '**/rest/v1/invoices*';

/** The deployed sign-in flow: welcome → auth sheet → email + password → /chat. */
async function signIn(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Already have an account/ }).click();
  const providers = page.getByRole('button', { name: 'Continue with email' });
  if (await providers.isVisible().catch(() => false)) await providers.click();
  await page.locator('#auth-email').fill(EMAIL);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/chat', { timeout: 30_000 });
}

test.describe('D1: delete an invoice in the shared sheet (P-06, P-93)', () => {
  test.skip(
    !process.env.E2E_AUTHED,
    'signed-in write checks: set E2E_AUTHED=1 (ZZ Test Seller only)',
  );
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL / E2E_PASSWORD are not set');

  test('figure in the card and the button, a failed delete says what did not happen, then it goes', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone-390', 'scripted at 390x844');
    // The chat parse, a capped account's tap-time PDF build and a retry all sit
    // inside this one test; the 30 s config default is far too short.
    test.setTimeout(240_000);
    mkdirSync(SHOTS, { recursive: true });
    const shot = (name: string) =>
      page.screenshot({ path: path.join(SHOTS, `${name}.png`), animations: 'disabled' });
    const sheet = page.locator('[data-pop-sheet]');

    // The share is stubbed: this spec is about deleting, and no real share sheet
    // should open on a headless run.
    await page.addInitScript(() => {
      const nav = navigator as unknown as Record<string, unknown>;
      Object.defineProperty(nav, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(nav, 'share', { configurable: true, value: async () => {} });
    });
    // The send POST fails once. That is what leaves a draft behind.
    await page.route(SEND, (route) => route.abort('internetdisconnected'));

    // ── Create the one throwaway draft.
    await signIn(page);
    await page.goto('/chat');
    await page.getByLabel('Message On It').fill('Invoice for Brandon Test, car wash, $200');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    const sendIt = page.getByRole('button', { name: 'Looks right — send it' }).first();
    await expect(sendIt).toBeVisible({ timeout: 60_000 });
    await expect(sendIt).toBeEnabled({ timeout: 60_000 });
    await sendIt.click();

    await expect(sheet).toBeVisible({ timeout: 30_000 });
    const number = (await sheet.innerText()).match(/INV-\d{4,}/)?.[0];
    expect(number, 'the draft has a number').toBeTruthy();
    console.log(`[e2e] throwaway draft ${number}`);
    await info.attach('invoice-number', { body: String(number) });
    await sheet.locator('button', { hasText: 'Keep as draft' }).click();
    await expect(sheet).toBeHidden();

    // ── Open that draft and its delete sheet.
    await page.goto('/invoices');
    await page.getByText(String(number), { exact: false }).first().click();
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Delete invoice' }).first().click();

    await expect(sheet).toBeVisible();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    // The figure card names the record and the money.
    await expect(sheet).toContainText(`${number} · Brandon Test`);
    await expect(sheet).toContainText('$200.00');
    // The go button carries the figure.
    const go = sheet.getByRole('button', { name: 'Delete invoice · $200.00' });
    await expect(go).toBeVisible();
    // A draft never asks for the typed word (board D1 note).
    await expect(sheet.locator('input')).toHaveCount(0);
    await shot('d1-idle');

    // ── The soft delete cannot land. The sheet says what did not happen, and it
    // names the real cause from errors.ts.
    let blocked = true;
    let attempted = 0;
    await page.route(PATCH_INVOICES, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      attempted += 1;
      if (!blocked) return route.continue();
      // Long enough to prove pending locks the sheet, short enough to stay quick.
      await new Promise((r) => setTimeout(r, 1200));
      await route.abort('internetdisconnected');
    });

    await go.click();
    await expect(sheet.getByRole('button', { name: 'Deleting…' })).toBeVisible({ timeout: 5000 });
    // Busy blocks dismissal: Escape and the scrim both do nothing.
    await page.keyboard.press('Escape');
    const scrim = page.locator('.onit-composer-scrim');
    if (await scrim.isVisible().catch(() => false)) {
      await scrim.click({ position: { x: 5, y: 5 }, force: true });
    }
    await expect(sheet, 'still open while busy').toBeVisible();
    await shot('d1-pending');

    await expect(sheet).toContainText("You're offline", { timeout: 20_000 });
    await expect(sheet).toContainText(`Nothing was deleted. ${number} is still in your list.`);
    await expect(sheet.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(attempted, 'the PATCH ran and failed').toBeGreaterThan(0);
    await shot('d1-error');

    // ── Let it through: the row is soft-deleted and the undo toast says so.
    blocked = false;
    await sheet.getByRole('button', { name: 'Try again' }).click();

    const toast = page.getByRole('status').filter({ hasText: 'Invoice deleted.' });
    await expect(toast).toBeVisible({ timeout: 30_000 });
    await expect(sheet).toBeHidden();
    await shot('d1-done');

    // Gone from the list, not erased: the row is soft-deleted.
    await page.goto('/invoices');
    await expect(page.getByText(String(number), { exact: false })).toHaveCount(0, { timeout: 30_000 });
  });
});
