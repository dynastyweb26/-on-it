// P-66 S1/S1b on a deployed PREVIEW — signed in, and the only spec here that
// writes data. It therefore runs ONLY when E2E_AUTHED is set, with the test
// seller's login in E2E_EMAIL / E2E_PASSWORD (env on the machine or a GitHub
// secret; nothing in the repo, nothing printed). The signed-out CI job leaves
// it skipped: one skipped spec, no credentials, no writes.
//
// Limits baked into the script (see the PR body):
//   • ZZ Test Seller only; the client on the one invoice is fake and has no
//     email or phone, so the preview's mailer can never reach a real person.
//   • Exactly one draft invoice and exactly one Mark as sent per run. The 1440
//     layout and the invoice-detail variant are checked on that same draft
//     before it is marked sent, rather than creating more drafts.
//   • Screenshots are written to tests/e2e/screenshots/ at run time and are not
//     committed; the PR body shows the frames from the verified run.
//
// Why the offline flip lives in the route handler: ChatView creates the draft
// row (finalize/insert) BEFORE it shares, and both of its offline guards bring
// up "You're offline — the invoice didn't send" instead of S1. So the browser is
// put offline at the exact moment the mark-sent POST fails — the failure is
// genuinely offline and navigator.onLine is false when ChatView reads it
// (offline: navigator.onLine === false, ChatView.tsx:2481), while the draft
// insert itself ran online.
//
// Call order being pinned down: on "Retry the share" / "Share PDF again",
// navigator.share() must be invoked synchronously inside the tap handler (iOS
// keeps the tap's activation that way) — before the first await, before any
// state set. The stub records whether the call arrived while the tap's task was
// still open; the assertion expects true.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const SHOTS = path.join('tests', 'e2e', 'screenshots');
const SEND = '**/api/invoices/*/send';

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

/** First visit to a tab opens its TutorialOverlay; Escape skips it (and marks the tab seen). */
async function skipTutorial(page: Page) {
  const tut = page.locator('[role="dialog"][aria-label$="tutorial"]');
  // It mounts after hydration, so give it a moment to show up before assuming
  // this tab has already been seen.
  await tut.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  if (await tut.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(tut).toBeHidden({ timeout: 10_000 });
    return true;
  }
  return false;
}

async function shares(page: Page) {
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
  await page.waitForURL('**/chat', { timeout: 45_000 });
}

test.describe('S1/S1b: shared, then the mark-sent POST failed (P-66)', () => {
  test.skip(
    !process.env.E2E_AUTHED,
    'signed-in write checks: set E2E_AUTHED=1 (ZZ Test Seller only)',
  );
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL / E2E_PASSWORD are not set');
  // This flow is scripted at 390x844; the 1440 layout is asserted inside it, so
  // the laptop project does not repeat the writes.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'phone-390', 'scripted at 390x844 (1440 is checked in-run)');
    mkdirSync(SHOTS, { recursive: true });
    await stubShare(page);
  });

  test('share succeeds → send fails offline → Mark as sent', async ({ page, context }, info) => {
    test.setTimeout(240_000);

    const shot = async (name: string) =>
      page.screenshot({ path: path.join(SHOTS, `${name}.png`), animations: 'disabled' });

    // The send POST. `pass` lets it through; `delayMs` keeps it in flight so the
    // locked state can be photographed; `flipOffline` drops the browser offline
    // at the instant of the first failure so S1 names the offline cause.
    let pass = false;
    let delayMs = 0;
    let flipOffline = true;
    let attempted = 0;
    await page.route(SEND, async (route) => {
      attempted += 1;
      if (pass) {
        await route.continue().catch(() => {});
        return;
      }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (flipOffline) {
        flipOffline = false;
        await context.setOffline(true).catch(() => {});
      }
      await route.abort('internetdisconnected').catch(() => {});
    });

    // ── 1. Sign in, create the one draft invoice in chat.
    await signIn(page);
    await page.goto('/chat');
    await page.getByLabel('Message On It').fill('Invoice for Brandon Test, car wash, $200');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    const sendIt = page.getByRole('button', { name: 'Looks right — send it' }).first();
    // The card's PDF is pre-built in the background before the tap is armed.
    await expect(sendIt).toBeVisible({ timeout: 90_000 });
    await expect(sendIt).toBeEnabled({ timeout: 90_000 });

    // The reply sometimes asks for an address or phone, and a card tap is
    // deliberately ignored while that question is pending (clientQuestionPending).
    // Decline it in-thread so both branches of the reply take the same path.
    const clientAsk = page.getByText(/address or a phone|phone number|email or a phone/i).first();
    if (await clientAsk.isVisible().catch(() => false)) {
      await page.getByLabel('Message On It').fill('No address or phone needed — just use Brandon Test.');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(sendIt).toBeVisible({ timeout: 90_000 });
      await expect(sendIt).toBeEnabled({ timeout: 90_000 });
    }

    // ── 2–3. Tap: the share succeeds (stub), the mark-sent POST cannot.
    await sendIt.click();

    // Exactly the PopSheet: other dialogs (the paywall, the terms prompt) also
    // carry role="dialog" and must never be mistaken for S1.
    const sheet = page.locator('[data-pop-sheet]');
    await expect(sheet).toBeVisible({ timeout: 45_000 });

    // ── 4. S1: both truths, the three answers, the offline cause line.
    const number = (await sheet.innerText()).match(/INV-\d{4,}/)?.[0];
    expect(number, 'S1 names the invoice').toBeTruthy();
    await test.info().attach('invoice-number', { body: String(number) });
    console.log(`[e2e] draft invoice ${number}`);

    await expect(sheet).toContainText(`${number} · Brandon Test`);
    await expect(sheet).toContainText('Shared, but not marked sent');
    await expect(sheet).toContainText('Brandon has the PDF');
    await expect(sheet).toContainText(/Shared \d{1,2}:\d{2}/);
    await expect(sheet).toContainText(`${number} is still a draft in On It`);
    await expect(sheet).toContainText('No pay link, no payment reminders');
    await expect(sheet).toContainText('You went offline right after the share sheet closed.');
    await expect(sheet.getByRole('button', { name: 'Mark as sent' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Retry the share' })).toBeVisible();
    // The sheet's × carries aria-label "Keep as draft" too, so the bottom action
    // is the last match inside the sheet.
    await expect(sheet.getByRole('button', { name: 'Keep as draft' }).last()).toBeVisible();
    expect(attempted, 'the send POST ran and failed').toBeGreaterThan(0);
    await shot('s1-idle');

        // ── 9. The laptop shape (Popup-Kit rule 8): at >=1280 the same sheet is a
    // centered 440px dialog. [data-pop-sheet] is the full-bleed overlay, so the
    // dialog geometry is measured on the panel inside it.
    const phone = page.viewportSize() ?? { width: 390, height: 844 };
    await page.setViewportSize({ width: 1440, height: 900 });
    const panel = sheet.locator('.onit-sheet-in');
    const box = await panel.boundingBox();
    expect(box, 'the dialog is laid out').toBeTruthy();
    expect(Math.round(box!.width), '440px dialog at 1440').toBe(440);
    expect(Math.abs(box!.x + box!.width / 2 - 720), 'centered').toBeLessThanOrEqual(2);
    await shot('s1-laptop');
    await page.setViewportSize(phone);
    await context.setOffline(false);

    // ── 5. Mark as sent while the POST cannot land: locked, then the failure.
    delayMs = 2500;
    await sheet.getByRole('button', { name: 'Mark as sent' }).click();
    await expect(sheet.getByRole('button', { name: 'Marking sent…' })).toBeVisible({ timeout: 3000 });
    await expect(sheet.getByRole('button', { name: 'Retry the share' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Keep as draft' }).last()).toBeDisabled();
    await shot('s1-pending');

    // ── 6. Dismissal is refused while it is busy: Escape and the scrim.
    await page.keyboard.press('Escape');
    await page.mouse.click(4, 400);
    await expect(sheet, 'still open while busy').toBeVisible();

    // The error frame's own words for the offline cause: "You're offline" plus
    // "… is still a draft. No connection. Check your signal and try again."
    await expect(sheet).toContainText(/You.re offline/, { timeout: 30_000 });
    await expect(sheet).toContainText(`${number} is still a draft. No connection.`);
    await expect(sheet.getByRole('button', { name: 'Try again' })).toBeVisible();
    await shot('s1-error');

    // ── 7. Keep as draft: closed, nothing written, S1b pinned in the transcript.
    delayMs = 0;
    await sheet.getByRole('button', { name: 'Keep as draft' }).last().click();
    await expect(sheet).toBeHidden();

    const s1bText = page.getByText(`${number} is still a draft`, { exact: false }).first();
    // S1b renders its own two answers. Unlike the sheet, the card carries no
    // error frame, so its go button keeps the idle label "Mark as sent" and the
    // share sits under it as "Retry the share". (#153's "Still offline" wording
    // is PopSheet's second-failure copy, not PopInline's.)
    await expect(s1bText).toBeVisible();
    await expect(page.getByText('Brandon has the PDF', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark as sent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry the share' })).toBeVisible();
    await shot('s1b-idle');

    // S1b must be readable where it landed: the whole card, and every action on
    // it, inside the viewport rather than behind the composer.
    const s1bCard = page.locator('[role="alert"]').filter({ hasText: `${number} is still a draft` }).first();
    await expect(s1bCard).toBeInViewport({ ratio: 1 });
    const s1bActions = s1bCard.getByRole('button');
    const s1bActionCount = await s1bActions.count();
    expect(s1bActionCount, 'S1b keeps its answers').toBeGreaterThan(1);
    for (let i = 0; i < s1bActionCount; i += 1) {
      await expect(s1bActions.nth(i)).toBeInViewport({ ratio: 1 });
    }

    // ── Call order: Retry the share reaches navigator.share inside the tap task.
    const before = (await shares(page)).length;
    await page.getByRole('button', { name: 'Retry the share' }).click();
    await expect
      .poll(async () => (await shares(page)).length, { timeout: 15_000 })
      .toBeGreaterThan(before);
    const calls = await shares(page);
    expect(calls[calls.length - 1].tapOpen, 'navigator.share() ran in the tap handler').toBe(true);
    // A Retry from S1b re-shares and re-posts, but on failure no sheet reopens —
    // shareSharedAgain() never calls setUnsentShareOpen(true), so S1b's own error
    // frame takes the news and the card stays put.
    await expect(
      page.locator('[role="alert"]').filter({ hasText: `${number} is still a draft` }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(sheet).toBeHidden();

    // ── 10. Invoice detail: the same failure, worded "Share PDF again".
    // The chat's S1b lives in React state and does not survive leaving /chat, so
    // the final Mark as sent is taken from the detail screen's own S1b card.
    await page.goto('/invoices');
    await skipTutorial(page);
    await page.getByText(String(number), { exact: false }).first().click();
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 45_000 });

    await page.getByRole('button', { name: /^Share/ }).first().click();
    await expect(sheet).toBeVisible({ timeout: 45_000 });
    await expect(sheet).toContainText('Shared, but not marked sent');
    await expect(sheet.getByRole('button', { name: 'Share PDF again' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Retry the share' })).toHaveCount(0);
    await shot('s1-detail');
    await sheet.getByRole('button', { name: 'Keep as draft' }).last().click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'Share PDF again' })).toBeVisible();

    // Nothing landed while the POST was blocked.
    expect(pass, 'still blocked through the detail variant').toBe(false);

    // ── 8. Unblock, then Mark as sent from S1b: toast + the row is sent.
    // No reload before this: the card is screen state, so a full page load would
    // clear the very card we are about to tap (the draft row itself survives, and
    // Share PDF again recovers it).
    // The detail's S1b keeps the idle label here: the sheet's error frame is not
    // carried onto the card, so the go action still reads "Mark as sent".
    pass = true;
    await page.getByRole('button', { name: 'Mark as sent' }).click();
    const toast = page.getByRole('status').filter({ hasText: `${number} marked sent. Pay link is live.` });
    await expect(toast).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('button', { name: 'Mark as sent' })).toBeHidden({ timeout: 45_000 });
    await shot('s1b-done');
  });
});
