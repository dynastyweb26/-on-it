// P-66 S1/S1b on a deployed PREVIEW — signed in, and the only spec here that
// writes data. It therefore runs ONLY when E2E_AUTHED is set, with the test
// seller's login in E2E_EMAIL / E2E_PASSWORD (env on the machine or a GitHub
// secret; nothing in the repo, nothing printed). The signed-out CI job leaves
// it skipped: one skipped spec, no credentials, no writes.
//
// Limits baked into the script (see the PR body):
//   • ZZ Test Seller only; the client on the one invoice is fake and has no
//     email or phone, so the preview's mailer can never reach a real person.
//   • Exactly one draft invoice and exactly one Mark as sent per run. The
//     invoice-detail variant is checked on that same draft before it is marked
//     sent, rather than creating more drafts. Phone only: the popup system has no
//     laptop layout yet.
//   • Screenshots land in tests/e2e/screenshots/ and carry only test data.
//
// Call order being pinned down: on "Retry the share" / "Share PDF again",
// navigator.share() must be invoked synchronously inside the tap handler (iOS
// keeps the tap's activation that way) — before the first await, before any
// state set. The stub below records whether the call arrived while the tap's
// task was still open; the assertion expects true.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const SHOTS = path.join('tests', 'e2e', 'screenshots');
const SEND = '**/api/invoices/*/send';

/** The sheet's text button. The × in the corner carries the same accessible name
 *  (it maps to the safe action), so getByRole alone matches two elements; hasText
 *  matches visible text only, so it picks the real button. */
const keepAsDraft = (sheet: Locator) => sheet.locator('button', { hasText: 'Keep as draft' });

type ShareCall = { tap: number; tapOpen: boolean };

/** One stub for the whole run: a share that "succeeds", plus tap-task bookkeeping. */
async function stubShare(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __share: Array<{ tap: number; tapOpen: boolean }>;
      __tap: number;
      __tapOpen: boolean;
    };
    w.__share = [];
    w.__tap = 0;
    w.__tapOpen = false;

    // Capture phase, so it runs before React's handler in the same task.
    document.addEventListener(
      'click',
      () => {
        w.__tap += 1;
        w.__tapOpen = true;
        // Cleared once the task's microtasks and the browser's own work yield.
        setTimeout(() => {
          w.__tapOpen = false;
        }, 0);
      },
      true,
    );

    const nav = navigator as unknown as Record<string, unknown>;
    Object.defineProperty(nav, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(nav, 'share', {
      configurable: true,
      value: async () => {
        w.__share.push({ tap: w.__tap, tapOpen: w.__tapOpen });
      },
    });
  });
}

async function shares(page: Page): Promise<ShareCall[]> {
  return page.evaluate(() => (window as unknown as { __share: ShareCall[] }).__share);
}

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

test.describe('S1/S1b: shared, then the mark-sent POST failed (P-66)', () => {
  test.skip(
    !process.env.E2E_AUTHED,
    'signed-in write checks: set E2E_AUTHED=1 (ZZ Test Seller only)',
  );
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL / E2E_PASSWORD are not set');
  // This flow is scripted at 390x844 and writes data, so the laptop project
  // does not repeat it.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'phone-390', 'scripted at 390x844');
    mkdirSync(SHOTS, { recursive: true });
    await stubShare(page);
  });

  test('share succeeds → send fails → Mark as sent', async ({ page }, info) => {
    // Sign-in, the AI parse and a capped account's tap-time PDF build take well
    // over the 30 s config default for a whole test. Per-test, not a config edit.
    test.setTimeout(180_000);
    const shot = async (name: string) =>
      page.screenshot({ path: path.join(SHOTS, `${name}.png`), animations: 'disabled' });

    // The send POST: aborted while `blocked`, optionally after a delay so the
    // pending state can be photographed. Counted, so the spec can prove nothing
    // was written while it was supposed to be blocked.
    let blocked = true;
    let delayMs = 0;
    let attempted = 0;
    await page.route(SEND, async (route) => {
      attempted += 1;
      if (!blocked) return route.continue();
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      await route.abort('internetdisconnected');
    });

    // ── 1. Sign in, create the one draft invoice in chat.
    await signIn(page);
    await page.goto('/chat');
    await page.getByLabel('Message On It').fill('Invoice for Brandon Test, car wash, $200');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    const sendIt = page.getByRole('button', { name: 'Looks right — send it' }).first();
    // The card's PDF is pre-built in the background before the tap is armed.
    await expect(sendIt).toBeVisible({ timeout: 60_000 });
    await expect(sendIt).toBeEnabled({ timeout: 60_000 });

    // ── 2–3. Tap: the share succeeds (stub), the send POST cannot (the route
    // above aborts it). The network stays up on purpose: capped accounts such as
    // the test seller get no background pre-build, so their tap builds and saves
    // the draft first, and that needs a live connection. The cause line is
    // therefore the "our end" one; the offline wording is pinned by
    // src/lib/popups/unsent-share.test.ts.
    await sendIt.click();

    const sheet = page.locator('[data-pop-sheet]');
    await expect(sheet).toBeVisible({ timeout: 30_000 });

    // ── 4. S1: both truths, the three answers, the offline cause line.
    const number = (await sheet.innerText()).match(/INV-\d{4,}/)?.[0];
    expect(number, 'S1 names the invoice').toBeTruthy();
    await test.info().attach('invoice-number', { body: String(number) });
    console.log(`[e2e] draft invoice ${number}`);

    await expect(sheet).toContainText(`${number} · Brandon Test · $200`);
    await expect(sheet).toContainText('Shared, but not marked sent');
    await expect(sheet).toContainText('Brandon has the PDF');
    await expect(sheet).toContainText(/Shared \d{1,2}:\d{2}/);
    await expect(sheet).toContainText(`${number} is still a draft in On It`);
    await expect(sheet).toContainText('No pay link, no payment reminders');
    await expect(sheet).toContainText('Something broke on our end right after the share.');
    await expect(sheet.getByRole('button', { name: 'Mark as sent' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Retry the share' })).toBeVisible();
    await expect(keepAsDraft(sheet)).toBeVisible();
    expect(attempted, 'the send POST ran and failed').toBeGreaterThan(0);
    await shot('s1-idle');

    // ── 5. Mark as sent while the POST cannot land: locked, then the failure.
    delayMs = 2500;
    await sheet.getByRole('button', { name: 'Mark as sent' }).click();
    await expect(sheet.getByRole('button', { name: 'Marking sent…' })).toBeVisible({ timeout: 2000 });
    await expect(sheet.getByRole('button', { name: 'Retry the share' })).toBeDisabled();
    await expect(keepAsDraft(sheet)).toBeDisabled();
    await shot('s1-pending');

    // ── 6. Dismissal is refused while it is busy: Escape and the scrim.
    await page.keyboard.press('Escape');
    const scrim = page.locator('.onit-composer-scrim');
    if (await scrim.isVisible().catch(() => false)) {
      await scrim.click({ position: { x: 5, y: 5 }, force: true });
    }
    await expect(sheet, 'still open while busy').toBeVisible();

    await expect(sheet).toContainText("You're offline", { timeout: 20_000 });
    await expect(sheet.getByRole('button', { name: 'Try again' })).toBeVisible();
    await shot('s1-error');

    // ── 7. Keep as draft: closed, nothing written, S1b pinned in the transcript.
    delayMs = 0;
    await keepAsDraft(sheet).click();
    await expect(sheet).toBeHidden();

    const card = page.getByRole('alert').filter({ hasText: `${number} is still a draft` }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(`Brandon has the PDF`);
    await expect(card.getByRole('button', { name: 'Mark as sent' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Retry the share' })).toBeVisible();
    await shot('s1b-idle');

    // ── Call order: Retry the share reaches navigator.share inside the tap task.
    const before = (await shares(page)).length;
    await card.getByRole('button', { name: 'Retry the share' }).click();
    await expect
      .poll(async () => (await shares(page)).length, { timeout: 10_000 })
      .toBeGreaterThan(before);
    const calls = await shares(page);
    expect(calls.length, 'one share call for the tap').toBeGreaterThan(before);
    expect(calls[calls.length - 1].tapOpen, 'navigator.share() ran in the tap handler').toBe(true);

    // ── 10. Invoice detail: the same failure, worded "Share PDF again".
    await page.goto('/invoices');
    await page.getByText(String(number), { exact: false }).first().click();
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 30_000 });

    await page.getByRole('button', { name: /^Share( PDF)?$/ }).first().click();
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await expect(sheet).toContainText('Shared, but not marked sent');
    await expect(sheet.getByRole('button', { name: 'Share PDF again' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Retry the share' })).toHaveCount(0);
    await shot('s1-detail');
    await keepAsDraft(sheet).click();
    await expect(sheet).toBeHidden();

    // Nothing landed while the POST was blocked.
    expect(blocked, 'still blocked through the detail variant').toBe(true);

    // ── 8. Unblock, then Mark as sent from S1b in chat: toast + sent.
    await page.goto('/chat');
    await expect(card).toBeVisible({ timeout: 30_000 });
    blocked = false;
    await card.getByRole('button', { name: 'Mark as sent' }).click();

    const toast = page.getByRole('status').filter({ hasText: `${number} marked sent. Pay link is live.` });
    await expect(toast).toBeVisible({ timeout: 30_000 });
    await expect(card).toBeHidden({ timeout: 30_000 });
    await shot('s1b-done');
  });
});
