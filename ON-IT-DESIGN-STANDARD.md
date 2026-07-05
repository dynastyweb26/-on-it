# On It — Design Standard v1.0 ("Warm Premium")

**Status:** Canonical. Supersedes all prior styling decisions in the On It codebase.
**Source:** Adapted from Stitch "On It Design System" exports (July 2026), reconciled
with Dynasty Web brand decisions below.
**Scope:** The On It PWA only. Does NOT apply to T-Vault (Syne + DM Mono, dark premium)
or to the four invoice PDF templates (separate decision — see Migration Plan, Out of Scope).

---

## 1. Brand direction

Voice-first financial tool for trade professionals. Personality: **premium yet
grounded** — high-quality stationery meets a well-worn leather tool belt. Warm
minimalist, field-optimized. The user may be wearing gloves, standing in sunlight,
operating one-handed.

Three non-negotiables that follow from that:
- **Numbers are the hero.** Currency amounts are always the most prominent element
  on any screen that contains them (`numeric-xl` / display scale, Montserrat 700).
- **Every interactive element ≥ 56px tall.** Gloves.
- **High contrast, warm tones.** Never pure white (#fff8f0 instead), never pure
  black (#1f1b13 instead).

## 2. Color tokens

Gold decision: On It's gold is **#D4AF37** (Stitch metallic gold), not T-Vault's
#D4A017. Close enough to read as the same Dynasty family, distinct enough that the
whole Stitch palette (which is mathematically tuned around #D4AF37) stays coherent.
Do not mix the two golds inside On It.

### Core roles (use these 90% of the time)

| Token | Hex | Use |
|---|---|---|
| `background` | `#fff8f0` | Page background ("warm white / paper") |
| `on-background` | `#1f1b13` | Default text (warm charcoal) |
| `surface-container-low` | `#fbf3e5` | Card backgrounds (soft cream lift) |
| `surface-container` | `#f5eddf` | Nested surfaces, input fills |
| `surface-container-high` | `#efe7da` | Hover states on cards |
| `primary` | `#735c00` | **Gold as TEXT/ICON/LINK** — the only gold safe on cream |
| `primary-container` | `#d4af37` | **Gold as FILL** — buttons, chips, FAB |
| `on-primary-container` | `#554300` | Text on gold fills (or `#1f1b13` for max punch) |
| `on-surface-variant` | `#4d4635` | Secondary text, captions |
| `outline` | `#7f7663` | Borders that must be visible |
| `outline-variant` | `#d0c5af` | Hairline dividers |
| `inverse-surface` | `#343027` | Dark feature cards (e.g. Net Earnings card) |
| `inverse-primary` | `#e9c349` | Gold text/figures ON dark surfaces |
| `error` | `#ba1a1a` | Overdue, destructive |
| `error-container` / `on-error-container` | `#ffdad6` / `#93000a` | Overdue chip |
| `tertiary` | `#415ba4` | Informational blue (links to docs, info states) — use sparingly |

### Semantic status colors (invoice states)

| State | Chip background | Chip text/icon |
|---|---|---|
| Paid | `#c9f2d4` (mint) | `#0f6d31` (forest green) + `check_circle` icon |
| Sent | `#f3e9c8` (pale gold) | `#735c00` + `send` icon |
| Overdue | `#ffdad6` | `#93000a` + `warning` icon |
| Draft | `#e5e2db` | `#474742` + `history` icon |

Status chips ALWAYS pair icon + text (accessibility — never color alone).

### The contrast rule (memorize this one)

`#d4af37` gold fails WCAG contrast as text on cream backgrounds. Therefore:
- Gold **text, icons, links** on light surfaces → `#735c00` (primary)
- Gold **fills** (buttons, FAB, selected states) → `#d4af37` with `#1f1b13` or `#554300` text
- Gold **on dark surfaces** (inverse cards) → `#e9c349`
- Never white text on `#d4af37`. Ever.

## 3. Typography

Dual-font strategy. Load via `next/font/google`.

- **Montserrat (700, 800):** headlines, financial figures, the wordmark. Architectural,
  sturdy. This replaces any prior heading font in On It.
- **Inter (400, 600):** body, labels, data. Nothing else.

| Token | Font | Size/Line | Weight | Notes |
|---|---|---|---|---|
| `display-lg` | Montserrat | 48/56 | 700 | -0.02em. Splash, hero totals |
| `display-md` | Montserrat | 32/40 | 700 | -0.01em |
| `numeric-xl` | Montserrat | 40/48 | 700 | **All primary currency amounts** |
| `headline-lg` | Montserrat | 24/32 | 700 | Screen titles (20/28 on mobile) |
| `body-lg` | Inter | 18/28 | 400 | Chat bubbles, voice transcription (italic while live) |
| `body-md` | Inter | 16/24 | 400 | Default body |
| `label-lg` | Inter | 14/20 | 600 | +0.05em, uppercase ok. Chips, section labels |

Currency formatting: always two decimals, `$` glyph same size as digits, rendered in
Montserrat 700 at `numeric-xl` or larger. Numbers are the product.

## 4. Iconography — Material Symbols Outlined

**This is the app's only icon system.** It replaces all emoji (closes the Batch 2
emoji-removal item) and any mixed icon libraries.

- Load `Material Symbols Outlined` (variable: wght 100–700, FILL 0–1) via Google Fonts.
- Default: weight 400, FILL 0. Active/selected nav items: FILL 1.
- Icons accompany text on chips, nav items, and stat cards; icons stand alone only
  for universally understood actions (mic, send, back, notifications).
- Icon color follows text color rules (§2 contrast rule).
- Canonical assignments: Chat `mic`, Invoices `description`, Money `payments`,
  Settings `settings`, notifications `notifications`, send `send`, preview
  `preview`, share `attach_file`/native share icon, paid `check_circle`,
  overdue `warning`, draft `history`, expense `shopping_cart`, deductible `receipt_long`.

## 5. Shape

"Friendly rigidity" — one radius per component class, no mixing:

- **Cards, sheets, modals:** 20px
- **Primary buttons:** pill (9999px) or 16px — pick pill, stay with it
- **Inputs:** 12px
- **Chips:** 8px
- **FAB / voice trigger:** circle

## 6. Spacing & layout

- 8px baseline grid. Container padding 24px. Gutter 16px.
- Card-to-card vertical spacing 16–24px.
- Touch targets: 56px minimum height, list items 64px.
- Mobile-first vertical stacks; one-handed reach. FAB bottom-right, clear of the tab bar.

## 7. Elevation

Tonal layering, not shadows:
- Page (`background`) → cards (`surface-container-low`) → nested (`surface-container`).
- Where a shadow is unavoidable: diffuse, 5–10% opacity, warm-tinted
  (`rgba(115, 92, 0, 0.08)`), never hard dark drop shadows.
- Pressed/voice-active: 2px `#d4af37` border or subtle inner shadow. **This is the
  spec for the Batch 2 "gold ring selected state" item — 2px solid #d4af37, offset 2px.**
- Glassmorphism (20px backdrop blur) reserved for exactly two places: fixed bottom
  nav and the voice-input overlay. Nowhere else.

## 8. Components

**Primary button** — 56px min height, pill, `#d4af37` fill, `#1f1b13` text, Inter 600.
Active: scale 0.97 + gold ring.

**Voice FAB** — 72px circle, `#d4af37`, `mic` icon in `#1f1b13`. Pulse animation while
listening (respect `prefers-reduced-motion`: swap pulse for a static FILL-1 icon +
"Listening" label).

**Invoice card** — 20px radius, `surface-container-low`. Status chip top-right,
client name headline top-left, amount bottom-left in `numeric-xl`, chevron affordance
right. 64px+ rows.

**Inputs** — 56px height, 12px radius, `surface-container` fill, 1px border
`rgba(212, 175, 55, 0.2)`, focus: 2px `#d4af37`.

**Voice transcription field** — live transcript in `body-lg` italic,
`on-surface-variant`, with a small animated waveform glyph. Confirms the app heard you.

**Chat bubbles** — App: white (`surface-container-lowest`), 20px radius. User:
`#d4af37` fill with `#3a2f00`-range text, 20px radius. Timestamps `label-lg`
in `on-surface-variant`.

**Dark stat card** (Money screen net earnings) — `inverse-surface` background,
label in `inverse-primary` at `label-lg`, figure in `#e9c349` Montserrat 700.
This is the one deliberately dark element per screen — don't multiply it.

**Bottom nav** — glass (blur 20px over `background` at ~80% opacity). Active tab:
pill highlight `#d4af37` at full or `primary` text + FILL-1 icon. Inactive:
`on-surface-variant`.

## 9. Voice & copy

Active voice, plain verbs, sentence case. Buttons say what happens: "Looks right —
send it", "Mark paid", "See all expenses". Errors say what went wrong and what to do
next; no apologies, no vagueness. Empty states invite the first action ("Tell me
about your first job — I'll draft the invoice."). Consistent vocabulary: an invoice
is always an *invoice*, a quote always a *quote*; the same action keeps the same
name from button to confirmation.

## 10. Relationship to the app icon

**Final: the white/glossy gold thumbs-up icon** (white rounded-square background,
metallic gold thumbs-up, "ON IT!" wordmark baked into the icon). This is the
shipped app icon — no further icon exploration, this is decided.

Because the icon itself is white/cream, the splash screen needs a treatment that
still gives it contrast rather than the dark-tile approach originally planned here.
Splash spec: `background` cream page (`#fff8f0`), icon centered with a thin
`outline-variant` (`#d0c5af`) or soft warm-shadow ring so its white edge doesn't
disappear into the page, no separate wordmark below it since "ON IT!" is already
in the icon art, then a brief hold and dissolve into the chat UI. Keep motion
minimal — fade/scale only, respecting `prefers-reduced-motion`.
