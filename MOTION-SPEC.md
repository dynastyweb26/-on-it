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

- Photo returned from camera: white flash overlay 0 → 1 → 0 over 220ms.
- Full-bleed photo scales into its chat bubble (scale 1 → .36, radius 0 → 40px, fades at the end), 460ms emphasized.
- Thinking row uses the spinner (item 2) with "Reading your receipt…".
- Expense card rises; amount counts up 500ms; LOGGED chip (#c9f2d4 / #0f6d31) springs in 200ms after.

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
- §8 Receipt capture: the photo lives as a thumbnail inside the Expense card, not a chat bubble. So: white shutter flash on capture, the Expense card builds in, and its thumbnail lands from 2.2× scale. No LOGGED chip; the save confirmation stays a chat message.
- §9 Books: count-up once per session (sessionStorage `onit_books_counted`); after adding an expense, Spent and Net roll in 400ms and Spent bumps once (no colour, per the no-coloured-numbers rule).
- §10 Tabs: the nav pill is measured per tab and glides (transform + width); tab-to-tab content enters from the side you're heading. Swipe-follows-finger not built. The selection ring animation applies to every `.chip-selected` and `.ring-gold-selected`.
- §11 Mic rings: `src/components/MicRings.tsx`; falls back to the old `.voice-listening` pulse when the AudioContext isn't running within 600ms.

## Status

- Batch A (items 1–6): merged to `main` 2026-09-30, verified on preview.
- Batch B (items 7–11): built on `feat/motion-b`, pending preview verification.
- Deploy per CLAUDE.md: preview with the global `vercel` CLI plus `vercel alias set … onit-dynastyweb-preview.vercel.app`; production = merge `--no-ff` to `main` and push (never `vercel --prod`).
