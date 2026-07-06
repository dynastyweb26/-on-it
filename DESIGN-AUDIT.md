# Design Audit — Warm Premium Migration (Step 1)

Inventory only; no code changed. Branch: `design/warm-premium` (from main `6569574`).
Vercel project confirmed: `on-it` (`prj_keV87af0b41itCq78ol0ajSHbdXA`).

## 1. Tailwind version

**v3.4.15** (`tailwindcss: ^3.4.15` in package.json, classic `tailwind.config.ts` +
`@tailwind` directives in globals.css).
→ Per Migration Plan Step 2: merge `tailwind.config.snippet.js` into the config and
carry over the base/body, ring, pulse, glass, and icon classes from `tokens.css`
(both files present in `design-reference/files (1)/on-it-warm-premium/on-it-design/`).

## 2. Hardcoded colors, grouped by file

### App chrome (IN scope — must move to tokens)

| File | Colors | Role |
|---|---|---|
| `tailwind.config.ts` | `#D4A017` (gold), `#E8C158` (gold-light), `#141210` (ink), `#FCFAF6` (paper), `#F3EFE7` (paper-dim), `#E5DFD2` (line) | The entire current token set. Replaced wholesale by the standard's tokens (`#fff8f0`, `#1f1b13`, `#d4af37`, `#735c00`, etc.) |
| `src/app/globals.css` | `#D4A017` (`--gold` var, line 6); orb gradient `#E8C158/#D4A017/#A87D0E` + 4× `rgba(212,160,23,…)` glows (lines 37–51) | Voice orb + splash keyframes. Orb gradient must be rebuilt around `#d4af37` |
| `src/app/layout.tsx` | `#D4A017` (line 16) | PWA `themeColor` → `#d4af37` |
| `src/components/Splash.tsx` | `#FCFAF6` bg, `#D4A017` stroke ×2 | Splash → `#fff8f0` bg; Step 7 respecifies the whole splash (wordmark Montserrat 800 + gold period) |
| `public/manifest.json` | (not grepped in src — check at Step 2) | likely theme/background color entries |

- Old gold `#D4A017` in app chrome: **6 occurrences** (config, globals ×2 zones, layout, splash ×2). The standard forbids mixing the two golds inside On It — all become `#d4af37` family.
- No pure `#fff`/`#000` in app chrome classes (Tailwind `bg-white`/`text-white` classes DO appear — `bg-white` on cards/chips/inputs in globals.css `.card`/`.chip` and ~15 JSX spots; `text-white` on `.btn-gold` and mic FAB, which violates "never white text on #d4af37" → becomes `#1f1b13`).

### PDF-render paths (OUT of scope per plan, listed for completeness)

| File | Colors | Note |
|---|---|---|
| `src/lib/colors.ts` | 20-swatch PALETTE (lines 12–31), `#FFFFFF`/`#000000` text rules (62, 82), `#D4A017` fallback accent (67) | Feeds `buildTheme()` for the four PDF templates + onboarding/settings swatch pickers. The swatches themselves are the user's brand colors for THEIR invoices — not app chrome. Untouched. |
| `src/app/(app)/chat/page.tsx` line 207, `src/app/(app)/invoices/[id]/page.tsx` line 52 | `#FFFFFF/#000000/#1A1A1A/#D4A017` | Fallback `BrandTheme` for PDF rendering when profile incomplete — PDF territory, untouched. |
| `src/lib/pdf/templates/index.tsx` | theme-token driven (no literals) | Out of scope. |

## 3. Fonts (current)

- `src/app/layout.tsx`: `Bricolage_Grotesque` (`--font-display`), `Figtree` (`--font-body`),
  `DM_Mono` (`--font-mono`) via `next/font/google`.
- Mapped in `tailwind.config.ts` → `font-display`, `font-body`, `font-mono`.
- Class usage: `font-display` (headings/wordmark) and `font-mono` (all currency figures)
  across 11 files: chat, dashboard, expenses, invoices, invoice detail, app layout,
  settings, root layout, login, onboarding, Tutorial.
- → Step 2 replaces with **Montserrat (700/800)** `--font-montserrat` and **Inter (400/600)**
  `--font-inter`. Decision needed at Step 2: current `font-mono` currency figures become
  Montserrat 700 `numeric-xl` per standard §3 (DM Mono goes away entirely).

## 4. Emoji inventory (B2 absorbed item)

- **Zero pictographic emoji remain** in `src/` (removed in Batch 2, commit `797e505`;
  re-verified by unicode-range grep today).
- Remaining typographic symbols (not emoji; flagged for Step 5 decisions):
  - `✓` check glyphs — onboarding swatch overlay, settings "Background ✓", expenses
    "✓ deductible" → replace with Material `check` / `check_circle` per standard §4.
  - `→` — dashboard "See all expenses →" → becomes outline button (Step 6 Money pass).
  - `×` — chat preview qty (`×2`) — data formatting, keep.
  - `·` and `…` — separators/ellipses in metadata lines — typography, keep.
- EmailJS templates: rendered/managed in the EmailJS dashboard, not in this repo —
  emoji check there is manual (flagged; can't grep it here).

## 5. Icon usage (all lucide-react → Material Symbols Outlined)

9 files import lucide. Full replacement map:

| File | lucide icons | Material Symbol |
|---|---|---|
| `(app)/layout.tsx` | MessageCircle, FileText, BarChart3, Settings, HelpCircle, History | `mic`, `description`, `payments`, `settings`, `help`, `history` (nav icons per standard §4 canon; active = FILL 1) |
| `(app)/chat/page.tsx` | Mic, Send, Share2, FileText | `mic`, `send`, `attach_file`/native, `description` |
| `(app)/invoices/[id]/page.tsx` | Share2, CheckCircle2, RefreshCw, FileText | `attach_file`, `check_circle`, `sync`, `preview` |
| `(app)/dashboard/page.tsx` | Plus, X | `add`, `close` |
| `(app)/settings/page.tsx` | Copy, Share2 | `content_copy`, `share` |
| `(app)/vault/page.tsx` | FileText, Download | `description`, `download` |
| `onboarding/page.tsx` | Image | `image` |
| `components/Tutorial.tsx` | X, Mic, FileText, Wallet, BellRing, RefreshCw, Share2 | `close`, `mic`, `description`, `account_balance_wallet`, `notifications`, `sync`, `share` |
| `components/VoiceMode.tsx` | X | `close` |

`lucide-react` can be uninstalled at the end of Step 5.

## 6. Border-radius inventory

| Class / inline | Count | px | vs. standard §5 |
|---|---|---|---|
| `rounded-full` | 26 | pill | ✔ buttons/FAB/dots stay pill; **chips must change to 8px** (`.chip` in globals.css is rounded-full) |
| `rounded-xl` | 16 | 12 | ✔ matches inputs spec; some non-input uses (nudge banner, saved toast) need review |
| `rounded-card` | 5 | 20 (1.25rem custom) | ✔ matches cards spec — keep token, rename source of truth |
| `rounded-3xl` | 2 | 24 | chat bubbles → 20px per standard §8 |
| `rounded-t-3xl` | 2 | 24 | bottom sheets (expense form, history) → 20px |
| `rounded-lg` | 2 | 8 | logo thumbnails — fine |
| `rounded-br-md`/`rounded-bl-md` | 2 | 6 | bubble tail corners — restyle with bubbles |
| inline `16 / 18 / 999 / 10` | 4 | — | PDF templates (out of scope) |

## 7. Notable gaps vs. standard (for the component passes)

- **Touch targets:** primary buttons/FAB are 56px (`h-14`) ✔; but `.chip` (~36px),
  tab bar items (~50px), and header icon buttons (40px) are under the 56px floor.
- **Selected state:** current `.chip-selected` = ring-2 `#D4A017` + bg tint + bold →
  respec to 2px `#d4af37` offset 2px (`.ring-gold-selected`, Step 7).
- **White-on-gold violations:** `.btn-gold` and the mic FAB use white text/icon on gold —
  standard forbids; becomes `#1f1b13`.
- **Dark stat card:** dashboard net card is `bg-ink` with `text-gold-light` `#E8C158`
  figure → `inverse-surface #343027` + `#e9c349` per §8.
- **Bottom nav:** solid white, no glass; needs `.glass-nav` treatment (one of exactly
  two allowed glass surfaces, with the voice overlay).
- **Voice orb/FAB:** current orb is a radial-gradient glow around old gold; VoiceMode
  overlay is the second allowed glass surface — currently opaque `bg-paper`.
