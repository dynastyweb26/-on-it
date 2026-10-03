# On It — Motion Spec v1

Source of truth for the designs: the "On It Motion Kit" canvas in Claude Design (10 boards). This file carries every number needed to build them. If this file and the canvas disagree, this file wins.

## Ground rules

- Animate `transform` and `opacity` only. Nothing that triggers layout (no height/width/top/left animation).
- Every animation has a reduced-motion fallback. `globals.css` already kills animations under `prefers-reduced-motion: reduce`; each item below says what the still state looks like.
- Count-ups and replays run once per session per screen, never on data restored from history.
- No emojis, Material Symbols Outlined only, Warm Premium tokens only.
- Audit before editing: find the real component for each item and report the file before changing it.

## 1. Motion tokens (build first)

Add to `tokens.css` / `globals.css` and use everywhere below:

```css
--motion-fast: 160ms;   /* exits, taps, toggles */
--motion-base: 240ms;   /* enters, chips, rows */
--motion-slow: 400ms;   /* cards, sweeps, sheets */
--ease-standard: cubic-bezier(.2,0,0,1);      /* default, things arriving */
--ease-emphasized: cubic-bezier(.65,0,.35,1); /* moves across the screen */
--ease-spring: cubic-bezier(.34,1.56,.64,1);  /* success moments ONLY */
```

Shared keyframes: `rise` (translateY(12px)+opacity → none), `fade`, `pop` (scale 0 → 1 on spring).

## 2. Assistant thinking spinner

- **Replaces:** the gold waveform icon next to "On It is thinking…". Label text stays.
- **Mark:** circular redraw of the logo, two arms: `public/icons/onit-spinner-arm-a.svg`, `onit-spinner-arm-b.svg` (viewBox 0 0 100 100, same center). Component: `src/components/OnItSpinner.tsx`. Render each as a masked span with `background-color: currentColor` so it inherits the label color (#7f7663). Size 20px inline.
- **Loop (1800ms, infinite):** each arm rotates 0→180→360deg with its own curve, so they separate and re-lock into the mark every half turn:
  - arm A: `cubic-bezier(.7,0,.4,1)`
  - arm B: `cubic-bezier(.35,0,.5,1)`
- **Exit:** thinking row fades 160ms; reply bubble rises 6px in 240ms.
- **Reduced motion:** static mark (the global rule in globals.css stops all animation).
- **Reuse:** same component for "Reading your receipt…" (item 8) and summary generation.

## 3. Quote / invoice card build-in

- Card: translateY(16px) scale(.98) → none, 320ms standard.
- Line items: rise 6px, 240ms each, stagger 70ms. **Cap: only the first 8 rows animate**; rows 9+ arrive with the card.
- Total: counts 0 → total over 600ms ease-out cubic, `font-variant-numeric: tabular-nums`.
- Send button ("Looks right — send it") fades in last, after the total lands.
- **Not on restore:** cards loaded from chat history render instantly.

## 4. Lock on send

- On sent: "Sent — locked" chip springs in (scale .7 → 1, 280ms spring); padlock icon drops and settles (translateY(-6px) rotate(-18deg) → none, 360ms spring, 80ms delay).
- "This quote was sent, so it's locked." + Revise button fade in 240ms, 120ms after the chip.
- Send button shows spinner + "Sending…" in place while the request is in flight.

## 5. Revise (must handle 20+ items)

Revise opens a NEW conversation seeded from the locked invoice (the original card is not shown beside the draft), so the motion is a transition:

- Tap Revise → the locked card folds out (opacity 0, scale .98, 150ms).
- The new conversation's draft card builds in with the standard card entrance (§3): only the first 8 rows animate; rows 9+ arrive with the card and use `content-visibility: auto`.
- **No-bug rules:** repeat taps are dropped for the whole transition (ref guard), no per-row timers, rows stay keyed as before. Reduced motion skips straight to the draft.

## 6. Sent → Paid

- Trigger (v1): a payment recorded on the invoice detail page that moves the invoice to paid. Opening an already-paid invoice never plays it.
- Deferred: the invoice-list version for pay-link payments. It needs last-seen status tracking per invoice.
- Gold (#d4af37 at 30%) layer wipes across the card left → right (scaleX 0 → 1, origin left) by 45%, then fades out; 900ms total, emphasized.
- Detail header: the status word springs in (now shown in paid green). List version (deferred): SENT chip → PAID chip (#c9f2d4 / #0f6d31, check_circle icon), spring pop 280ms.
- Amount: 1.06 bump (360ms).
- Haptic: `navigator.vibrate?.(12)` as the chip lands (Android only; iOS ignores it).

## 7. Failure + retry

- Error message arrives with one shake: translateX -5, 5, -3, 3, 0 over 320ms.
- "Try again" keeps its width; icon swaps to a spinner in place.
- Fails again: shake again and change copy to "Still couldn't save it. Check your signal and try again."
- Succeeds: error collapses, check_circle pops (spring), card rises 120ms after.
- Haptic: `navigator.vibrate?.([10, 40, 10])` on failure.

## 8. Receipt capture

As built on `feat/receipt-motion` (board "05 · Receipt capture"; supersedes the Batch B note below). Transform and opacity only.

- **Flash** (`.onit-shutter`): fires once the camera / photo sheet is gone — the page is visible (`document.visibilityState`, or the `visibilitychange` back to visible) plus two animation frames. Fired under the sheet it was never seen on iPhone. Pure white, 0 → 1 in 40ms, hold at 1 for 80ms, 1 → 0 over 260ms ease-out (`cubic-bezier(0,0,.2,1)`): 380ms. Rests at opacity 0; `display:none` under reduced motion.
- **Photo → bubble** (`ReceiptBubble`): the photo is a real chat message on the user's side (a ~264px JPEG data URL). After `img.decode()` and the flash's peak (end of the hold, `FLASH_PEAK_MS` 120), a full-bleed copy shrinks into the bubble's place, 460ms `--ease-emphasized`, and crossfades into the rounded bubble, so the corners read 0 → 16px without animating border-radius. Decode failure or reduced motion: the bubble just appears.
- **Reading**: "Reading your receipt…" with the spinner (§2) sits under the bubble. The Expense card's own thumbnail no longer animates.
- **Save → logged card** (`LoggedExpenseCard`): the Expense card folds away (`onit-card-exit`, 150ms) and a compact card arrives (`onit-logged-in`, 240ms: down from slightly larger) — thumbnail, store, category · date, amount. The amount counts up 500ms (`CountUpMoney`); the LOGGED chip (#c9f2d4 / #0f6d31, `check_circle`) springs in 200ms after (scale .7 → 1, `--ease-spring`). It replaces the old text confirmation.
- **Restore / errors**: restored chats show the bubble and the logged card static, no replay. A duplicate receipt or a read error keeps the bubble, then the normal message.
- **Storage**: only the newest 8 thumbnails are persisted with the chat (older bubbles restore as a "Receipt photo" placeholder; archived history keeps none), with an image-free retry on a quota error.

## 9. Books

Layout as shipped: dark Net card with chevron, 3 tiles (Collected / Still owed / Spent) with color dots, Add expense, Summary & PDFs.

- First open per session: Net card rises and counts up with cents, 700ms. Tiles rise 70ms apart and count whole dollars (560ms each, delays 140/210/280ms). Buttons rise last (300ms, 350ms).
- Each tile's dot pops (scale 0 → 1, spring) as its number lands.
- Chevron nudges once after the count (translateX 0 → 5 → -1 → 0, 520ms, 900ms delay). Net card press: scale .98.
- Returning after an expense: Spent and Net roll old → new in 400ms (no re-enter); Spent bumps once (no colour: Books keeps numbers uncoloured).

## 10. Tabs + selected ring

- Bottom nav: the gold pill slides to the new tab (translateX, 300ms emphasized) instead of jumping.
- Content enters 28px from the side you're heading, 280ms standard; the old screen just leaves.
- Swipe navigation (later): same axis; content and pill follow the finger, snap past 30% width.
- Selected ring, app-wide: box-shadow from `0 0 0 6px rgba(212,175,55,0)` to `0 0 0 2px #d4af37`, 240ms. Applies to Invoices filters and every other selectable.

## 11. Mic listening (build last)

- Replaces the fixed `onit-pulse` loop.
- Listening: 3 rings behind the mic button scale with live input level (Web Audio `AnalyserNode`, RMS), 110ms linear follow. Scales: ring 1 = 1.08 + L×0.22, ring 2 = 1.16 + lag×0.34, ring 3 = 1.24 + lag×0.5 (lag = smoothed level). Ring fills: #d4af37 at 38% / 26% / 16%.
- Idle: mic breathes 1 ↔ 1.04, 2400ms.
- Transcribing: rings fade 180ms; pending gold bubble pops (240ms) with a shimmer.
- Reduced motion: one static ring, icon swap only.
- Performance: throttle level updates to ~9/sec; stop the analyser when not listening.

## 12. Recaps (weekly / monthly)

The old recap sheet (`RecapSheet.tsx`, "sheet rises, figures count up") was
removed when the full-screen story shipped (`9eb43c0`, merged to `main` in
`683301b`). Recap motion now lives in three places:

- **Watch / Later sheet:** `src/components/recap/RecapProvider.tsx`. It rises
  from the bottom edge (`onit-sheet-in`: translateY(100%) → 0, `--motion-slow`,
  `--ease-standard`). The swoosh mark wears a gold ring.
- **The story player:** `src/components/recap/RecapStory.tsx` and its slides.
  One rAF clock drives paused WAAPI animations: a 700ms swoosh-wipe between
  slides, count-ups, columns + ribbon, sound cues. Its timings live in
  `src/lib/recap/config.ts` and are specified in `RECAP-SPEC.md` §2–§6, not
  here. Reduce Motion: 350ms fades, 280ms cross-fade, final numbers, no ticks.
- **History list** (`/recaps`) and the Books Recaps card: no motion beyond
  press feedback.
- The Totals / Itemized PDF choice opens with the period-picker sheet's motion
  (`paywall-in 200ms ease-out`).

## 13. Foundations for the UI redesign (`feat/ui-redesign`, 2026-10-03)

The redesign's motion reference is `design-reference/on-it-motion.html`.
**Easing stays on this spec's tokens (§1)** everywhere except the composer,
its "+" menu and the template, which use the release frames' motion spec
(1d) exactly (§14). **Superseded by §14 (audit rev 2):** M4 now replaces §6;
M1 lands with the template (merge 2).

- **Reduced motion from JS:** `src/lib/use-reduced-motion.ts`
  (`usePrefersReducedMotion`, live). Use it for WAAPI / rAF / carousel motion,
  which the global CSS kill switch doesn't reach. CSS motion needs nothing.
- **Sheets:** bottom sheets rise with `onit-sheet-in` (`--motion-slow`,
  `--ease-standard`). Centred dialogs and small choice sheets keep `paywall-in`
  (200ms). One entrance per sheet; exits stay instant (no exit animation yet).
- **Toasts:** rise 12px and fade in (`onit-toast-in`, `--motion-base`,
  `--ease-standard`). The keyframes keep the toast's own centring; the keyboard
  lift uses the separate `translate` property, so the two never fight.
- **Switches:** the knob moves with `transform` (`translate-x-6`, 160ms), never
  `left` (the transform / opacity ground rule).
- **Micro (≤ 180ms):** steppers, chips, tabs, segmented controls.
  **Confirm (300–500ms):** add / remove, prompts, status.
  **Hero (≤ 1.2s):** rare (send, save, paid).
- **Haptics:** `navigator.vibrate` only, so Android only (iOS Safari / PWA has
  no vibration API).
- **Nav (5 tabs):** Clients · Invoices · Chat (centre) · Books · Settings.
  Superseded by §14 (M5).

## 14. UI redesign merge 1 as built (`feat/ui-redesign`, 2026-10-03)

Audit rev 2 (UI-REDESIGN-AUDIT.md §4, founder rule F5): the release frames'
motion spec **1d** gives exact values for the composer, menu and template;
everything else uses this spec's tokens (§1).

**Composer + menu (1d, exact):**
- "+" (44 px, soft gold `#f0e3b8`) → ×: glyph rotates 45° in
  **300ms `cubic-bezier(.3,1.5,.5,1)`**; fill flips to ink in 200ms ease.
- Scrim: cream frost (`background` at 85%) fades in **220ms ease**, portaled
  to `<body>`; the bar is lifted above it (stays sharp).
- Options: rise from `16 + 12 × distance` px and scale .88 → 1,
  **340ms `cubic-bezier(.2,1.3,.4,1)`**, opacity 180ms ease, nearest the "+"
  first, **45ms** apart; transform origin `22px 100%`.
- Close (×, scrim, Escape, a pick): everything reverses together, **180ms**,
  no stagger.
- Voice session lives in the field: red level dot (MicRings, red tone) +
  "Listening…" + Done; Speak between takes; the "+" slot is the ink × that
  ends the session.

**Chat thread (tokens):** a new bubble rises 8px (`--motion-base`,
`--ease-emphasized`). "On It is thinking…" and "Reading your receipt…" both
use the On It spinner (§2) row — no typing dots (device pass, merge 1).

**Tabs (M5, tokens; replaces §10's side entry):** the gold disc slides to the
active icon pill (`--motion-slow`, `--ease-spring`); the new tab's icon
bounces 4px (`--motion-slow` spring); the screen crossfades (`--motion-fast`);
Chat presses .9 + 1px down, others .95; light haptic on a tab change.

**Lists (tokens):** Invoices filter → list crossfades with a 12px shift
toward the direction of travel (`--motion-fast`); status tags crossfade when
they change (sent → viewed); segmented controls slide a white thumb
(`--motion-fast` spring).

**Books (tokens):** the count-up plays on the **first visit of the day**
(localStorage `onit_books_counted_day`, was once per session); the Recaps dot
pulses once (one ring, 600ms); tiles press .97 in 120ms.

**Paid (M4, tokens; replaces §6's gold sweep):** status word fades (120ms),
PAID stamp lands with a settle (200–700ms), the card dips 3px on impact, the
due amount rolls down (500–1200ms, `RollMoney`), success tick at impact.

**Failure (§7 update):** shake 6px, three decaying passes, 360ms
emphasized; inline "Retry" label + icon; warning haptic `[10, 40, 10]` once
per live failure and again on a failed retry.

Reduce Motion: the global kill switch lands every CSS animation on its end
state; RollMoney / CountUpMoney show the final figure.

## Build order (one commit each)

Batch A (preview, test on phone, merge):
1. Motion tokens + shared keyframes
2. Thinking spinner component + assets
3. Card build-in + total count-up
4. Lock on send
5. Revise (with bulk rules)
6. Sent → Paid

Batch B (preview, test on phone, merge):
7. Failure + retry
8. Receipt capture
9. Books count-up + expense roll
10. Tab pill + content axis + selected ring
11. Mic rings

## Batch B as built (differences from the canvas)

- §7 Failure + retry: the existing icon-only Retry button spins in place (no "Trying…" label). Live failures shake on arrival; restored chats don't. A retry that fails again re-shakes. No failure haptic yet.
- §8 Receipt capture (Batch B, superseded by §8 as built on `feat/receipt-motion`): the photo lived as a thumbnail inside the Expense card. On device nothing showed: the flash fired under the camera sheet, and the thumbnail's scale-in ran above the viewport (the list pins to the bottom of the tall card). Under reduced motion the flash left an opaque white layer (hotfix `9a6b8f7`).
- §9 Books: count-up once per session (sessionStorage `onit_books_counted`); after adding an expense, Spent and Net roll in 400ms and Spent bumps once (no colour, per the no-coloured-numbers rule). The buttons' rise (300ms, 350ms) was missed in Batch B and added on `feat/recap`: Add expense 300ms, Income & Expenses 350ms, View expenses 400ms.
- §10 Tabs: the nav pill is measured per tab and glides (transform + width); tab-to-tab content enters from the side you're heading. Swipe-follows-finger not built. The selection ring animation applies to every `.chip-selected` and `.ring-gold-selected`.
- §11 Mic rings: `src/components/MicRings.tsx`; falls back to the old `.voice-listening` pulse when the AudioContext isn't running within 600ms.

## Status

- Batch A (items 1–6): merged to `main` 2026-09-30, verified on preview.
- Batch B (items 7–11): merged to `main` 2026-09-30 (`fa6866e`), verified on preview.
- Deploy per CLAUDE.md: preview with the global `vercel` CLI plus `vercel alias set … onit-dynastyweb-preview.vercel.app`; production = merge `--no-ff` to `main` and push (never `vercel --prod`).
