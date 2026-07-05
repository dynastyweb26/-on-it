# On It — Warm Premium Migration Plan

**For:** Claude Code, in repo `dynastyweb26/-on-it`
**Rules:** Audit first. One commit per step. `npm run build` must pass before every
commit. Confirm branch and Vercel project (`on-it`) before any push. No pushing to
main until the visual QA step passes.

**This restyle is its own batch ("Batch 3 — Warm Premium").** It absorbs the
following items from Batches 1–2 so they aren't done twice: splash screen animation
(B1), voice mode redesign styling (B1), tutorial card styling (B1), gold ring
selected state (B2), app-wide emoji removal (B2), Sidebar template polish decision
(B2 — resolved as out of scope here, see bottom).

---

## Step 0 — Branch + snapshot
- `git checkout -b design/warm-premium` from latest main.
- Confirm Vercel project name before anything deploys.

## Step 1 — Audit (no changes, output an inventory file)
Produce `DESIGN-AUDIT.md` in the repo root containing:
- Tailwind version (v3 or v4) — this decides tokens.css vs config snippet.
- Every hardcoded hex/rgb color in `app/` and `components/` (grep `#[0-9a-fA-F]{3,8}`
  and `rgb(`), grouped by file.
- Current font imports and where font classes are applied.
- Every emoji in JSX/strings (grep unicode emoji ranges) — this is the B2 removal list.
- Any existing icon usage (lucide? heroicons? inline SVG?) to be replaced by
  Material Symbols.
- All border-radius values in use.
- Commit: `chore(design): audit inventory for warm premium migration`

## Step 2 — Foundation
- Add Montserrat (700, 800) + Inter (400, 600) via `next/font/google` with CSS
  variables `--font-montserrat`, `--font-inter` in the root layout.
- Add Material Symbols Outlined (variable font) — prefer self-hosted or
  `next/font` if feasible; otherwise the Google Fonts stylesheet link with
  `display=swap`.
- Install tokens: Tailwind v4 → merge `tokens.css` into `app/globals.css`;
  v3 → merge `tailwind.config.snippet.js` into config + keep the base/body,
  ring, pulse, glass, and icon classes from tokens.css.
- Remove old font setup.
- Commit: `feat(design): warm premium token foundation (fonts, colors, radii)`

## Step 3 — Global surfaces
- Body background → `background`, default text → `on-background`.
- All cards → `surface-container-low` + 20px radius + warm shadow (or no shadow).
- Kill every pure `#fff`/`#000` usage found in the audit (whitelist: `on-primary`
  white on the rare `primary`-filled element, and the invoice preview which mimics
  paper).
- Commit: `feat(design): global surface + text color migration`

## Step 4 — Component pass (one commit each)
1. **Buttons:** primary = 56px min-height, pill, `primary-container` fill,
   `on-background` text, active scale 0.97. Secondary = outline style with
   `outline-variant` border on `surface-container`.
2. **Inputs:** 56px, 12px radius, `surface-container` fill, gold 20% border,
   focus 2px `#d4af37`.
3. **Chips:** 8px radius, semantic container colors, icon + text always
   (paid `check_circle`, sent `send`, overdue `warning`, draft `history`).
4. **Voice FAB:** 72px, `primary-container`, `mic` icon, `.voice-listening`
   pulse class, reduced-motion fallback.
5. **Bottom nav:** `.glass-nav`, active tab = gold pill or `primary` text +
   FILL-1 icon, inactive = `on-surface-variant`. Material Symbols:
   Chat `mic`, Invoices `description`, Money `payments`, Settings `settings`.
6. **Chat bubbles:** app = `surface-container-lowest` white, user =
   `primary-container` gold with `on-primary-container` text, both 20px radius.

## Step 5 — Emoji removal (B2 item, absorbed)
Using the Step 1 inventory, replace every emoji with the equivalent Material
Symbol or delete where decorative. Zero emoji remain app-wide, including toasts,
empty states, and email/EmailJS templates rendered in-app.
- Commit: `refactor(design): replace all emoji with Material Symbols`

## Step 6 — Screen passes (one commit per screen)
- **Chat:** bubble styles, draft-invoice card (status label `label-lg` in
  `primary`, amount `numeric-xl`, "Looks right — send it" primary button),
  live transcription line in `body-lg` italic + waveform glyph.
- **Invoices:** filter chips row, invoice cards per component spec, FAB placement
  clear of nav.
- **Money:** dark net-earnings card (`inverse-surface` + `#e9c349` figure —
  the ONE dark element on the screen), four stat cards with icon chips,
  "See all expenses" outline button, recent-activity rows at 64px.
- **Settings:** rows at 64px, section labels `label-lg`, no stray colors.

## Step 7 — Splash + selected states (B1/B2 items, absorbed)
- Splash: cream `background`, centered dark app-icon tile or gold mark, wordmark
  Montserrat 800 with gold period, fade/dissolve into UI. Respect reduced motion.
- Apply `.ring-gold-selected` (2px #d4af37, offset 2px) everywhere a selected
  state exists (template picker, tab states, toggles). This closes the B2 gold
  ring item with a single consistent treatment.

## Step 8 — QA gate (before merge)
- Contrast: spot-check every text/background pair introduced — especially
  anything gold. `#735c00` on `#fff8f0` passes AA; `#d4af37` as text does not.
- Touch targets: nothing interactive under 56px (inspect rendered sizes, not
  class names).
- prefers-reduced-motion honored on pulse + splash.
- Lighthouse a11y run on Chat, Invoices, Money.
- Screenshot each screen at 390px width, compare against the Stitch mockups.
- Merge to main, verify Vercel production deploy on the correct project.

---

## Out of scope (deliberate)
- **Invoice PDF templates (Classic, Sidebar, Industrial, Friendly):** these are
  the client-facing paper artifacts; restyling them is a separate decision with
  its own risks (they're what customers' clients actually see). Revisit after
  Stripe. This also resolves the B2 "Sidebar template polish" question: park it.
- **T-Vault:** untouched. Different product, different system (Syne/DM Mono, dark).
- **Marketing site / dynastyweb.co pages:** later.
