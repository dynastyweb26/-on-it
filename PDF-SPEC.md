# On It — PDF Rendering Specification

Files this governs:

| File | Role |
|---|---|
| `src/lib/colors.ts` | `PALETTE`, `BrandTheme`, `buildTheme()`, `onColor()` |
| `src/lib/pdf/templates/index.tsx` | Classic, Ledger, Industrial, Friendly |
| `src/lib/pdf/generate.ts` | `elementToPdf()` — html2canvas → jsPDF |
| `src/lib/pdf/summary-template.tsx` | Expense summary — separate rules, out of scope |

Templates are keyed `classic`, `sidebar` (labels as **Ledger**),
`industrial`, `friendly`. The `sidebar` DB key is load-bearing — do
not rename it.

---

## 0. Ground rules

1. **Color is user-selected, not designed.** Users pick 2–3 swatches
   from `PALETTE` and nominate one as background. Nothing may assume
   a hue.
2. **The financial engine calculates. Templates display.**
   `ItemsTable` currently computes `li.qty * li.unit_price` inline —
   that is the pattern to remove.
3. **Never scale a document to fit.** Illegible is worse than two
   pages.
4. **`money()` already guards non-finite values**, returning `$—`.
   Keep it. Do not add a second formatter.
5. Regression floor: a 2-line quote with no notes must render
   essentially as it does today in all four templates.

---

## 1. Root causes — diagnosed, not guessed

### 1.1 `primary` serves two roles with opposite contrast needs

`BrandTheme.primary` is used as:

- **text color** for the business name — Classic, Ledger, and
  Friendly all do `t.primary === t.background ? t.text : t.primary`
- **background fill** for the table header — `ItemsTable` does
  `background: t.primary, color: onColor(t.primary)`
- **background fill** for the entire masthead band in Industrial

Text wants high contrast against the page. A header bar wants to
recede. One token cannot do both.

**Worked example.** Cyril picks `#B91C1C`, `#1A1A1A`, `#C0C0C0`,
background `#1A1A1A`.

```
rest           = ['#B91C1C', '#C0C0C0']
score(#B91C1C) = sat 0.85 + lum 0.073 × 0.5 = 0.89
score(#C0C0C0) = sat 0.00 + lum 0.527 × 0.5 = 0.26
→ accent  = #B91C1C
→ primary = #C0C0C0   (Silver)
```

Silver becomes the business-name color — the gray company name.
Silver becomes the table header fill — the too-bright bar. Two
observed defects, one cause.

### 1.2 Accent used as body text

`Branding` renders `color: t.accent, opacity: 0.65`. On Cyril's
theme that is `#B91C1C` on `#1A1A1A` ≈ 1.8:1 before opacity. The
footer is effectively invisible.

Same pattern in Classic's thank-you line, `Meta` labels, `Website`,
and the slogan. The accent is a *fill* color that works as text only
when the user's picks happen to be lucky.

### 1.3 No muted token exists

`BrandTheme` is `{ background, text, primary, accent }`. With no
secondary text color, templates fake one with `opacity: 0.85`,
`0.8`, `0.65`, and hardcoded `#334155` / `#e6e3dd` in
`PaymentBlock` — fixed light-mode colors sitting on a user-chosen
background.

### 1.4 No deposit in the data model

`InvoiceRenderData` has `subtotal`, `taxRate`, `taxAmount`, `total`,
`notes`. No deposit, no payments received, no amount due.

"40% deposit required" reaches the page through `d.notes`. The
customer is told a percentage and left to compute the dollar figure.
That is a schema gap, not a layout gap.

### 1.5 Pagination is impossible by construction

`PAGE` sets `minHeight: 1123`. Content longer than that overflows
the element. Then:

```js
pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 794, 1123);
```

The entire captured canvas — however tall — is drawn into one fixed
794×1123 box. Long invoices squash vertically. One line.

### 1.6 JPEG is the wrong codec here

`toDataURL('image/jpeg', 0.92)` on flat dark backgrounds with fine
text produces ringing around every glyph. This is why the PDF looks
muddier than an on-screen screenshot of the same document.

Commit `a957431` on `feat/invoice-pdf-pagination` already switched
this to PNG and was never merged.

---

## 2. Color system

### 2.1 Extend `BrandTheme`

```ts
export interface BrandTheme {
  background: string;
  text: string;        // #FFFFFF on dark bg, #000000 on light — unchanged
  primary: string;     // KEPT for back-compat, see 2.2
  accent: string;      // KEPT — fills, rules, emphasis
  // new:
  heading: string;     // business name, headings — TEXT role
  surface: string;     // table header bar, payment cards — FILL role
  muted: string;       // slogan, URL, footer, secondary text
  rule: string;        // hairline separators
  accentInk: string;   // accent made safe AS TEXT on `background`
}
```

`primary` stays in the interface so existing call sites keep
compiling. New code uses `heading` for text and `surface` for fills.

### 2.2 Derivation

Add to `buildTheme()`. All derived from `background`, `text`, and
`accent` — never hardcoded.

| Token | Rule |
|---|---|
| `heading` | `primary` when `contrast(primary, background) >= 4.5`, else `text`. Silver on near-black passes; Silver on white does not and falls back to black. Compute it. |
| `surface` | `background` mixed 12% toward `text`. On `#1A1A1A` ≈ `#2E2E2E` — reads as structure, not highlight. **Never `primary`.** |
| `muted` | `background` mixed 62% toward `text`. On `#1A1A1A` ≈ `#A8A8A8`. Replaces every `opacity:` hack. |
| `rule` | `background` mixed 22% toward `text`. |
| `accentInk` | `accent` adjusted until it clears 4.5:1 against `background`. `darkenForWhite()` already handles the light case — write the lightening mirror and branch on `isDark(background)`. |

### 2.3 Application

| Element | Current | Required |
|---|---|---|
| Business name | `primary` | `heading` |
| Table header fill | `primary` | `surface` |
| Table header text | `onColor(primary)` | `onColor(surface)` |
| Industrial masthead band | `primary` | `surface` |
| Slogan | `accent` | `accentInk` |
| `Website` link | `accent` | `accentInk` |
| `Meta` labels | `accent` | `accentInk` |
| `Branding` footer | `accent` + `opacity .65` | `muted`, no opacity |
| Thank-you line | `accent` | `muted` |
| Notes body | `opacity: .85` | `text`, full opacity |
| Row separators | `${t.accent}33` | `rule` |
| `PaymentBlock` border | hardcoded `#e6e3dd` | `rule` |
| `PaymentBlock` heading | hardcoded `#334155` | `muted` |
| Grand total fill | `accent` | unchanged — correct |
| `DocTypeMark` | `accent` | unchanged — correct |

**Every `opacity:` applied to a color in these templates is
removed.** Opacity over an unknown background is how you get
invisible text.

### 2.4 Accent budget

Accent as a **fill**: at most three per page — masthead rule,
document-type mark, grand total block. As `accentInk` for **text**:
at most two — slogan and website.

The hardcoded `PAY_COLOR` brand marks are the one permitted
exception. Cash App green and Venmo blue are not yours to derive.

### 2.5 Contrast assertions

Dev-only check on theme construction:

```
contrast(heading, background)        >= 4.5
contrast(text, background)           >= 7.0
contrast(muted, background)          >= 4.5
contrast(onColor(surface), surface)  >= 4.5
contrast(onColor(accent), accent)    >= 4.5
```

`PALETTE` has 20 swatches. Run the full background × pick matrix
once in CI — it is cheap, and it is the only way to know a Sunshine
Yellow background does not produce unreadable output.

---

## 3. Typography

### 3.1 What is already right — preserve it

- `money()` guards non-finite values.
- Ledger's `MONO` numerals, and the comment explaining why Georgia
  is excluded (oldstyle figures; html2canvas ignores
  `font-variant-numeric`). That is hard-won knowledge. Keep the
  comment.
- Montserrat loaded via `next/font` so it is available to the
  capture.
- Per-template faces: `SLAB` for Ledger, `MONTSERRAT` elsewhere.

### 3.2 Letter-spacing — the word-breaking fix

| Location | Current | Required |
|---|---|---|
| `DocTypeMark` | `letterSpacing: 5` at 22–24px | `0.14em` |
| Industrial type bar | `letterSpacing: 6` | `0.14em` |
| Industrial meta | `letterSpacing: 3` | `0.08em` |
| Ledger doc noun | `letterSpacing: 3` at 36px | `0.08em` |
| `PaymentBlock` heading | `letterSpacing: 1.5` | keep |
| Section eyebrows | `1`–`1.5` | keep |

Rule: tracking in **em, never px**, so it scales with font size.
Fixed px tracking at large sizes produced `W H I T E  FA U X`.

Tracking applies only to document-type marks, section eyebrows,
table headers, and the `Branding` footer.

### 3.3 Size floors

| Element | Current | Required |
|---|---|---|
| Notes body | 12 | **14** |
| `Branding` footer | 10 | 11 |
| Table body | 16 | 15 |
| Thank-you line | 12–13 | 12 |

Notes at 12px with `opacity: .85` is the least readable thing on the
page, and it is where deposit terms and lead times live.

### 3.4 Notes treatment

Notes currently render four different ways: right-aligned at
`maxWidth: 300` in Classic, in a left-bordered box in Industrial,
bare in Ledger and Friendly. Standardize:

- Eyebrow label `NOTES` above the body, `muted`, tracked.
- Body at 14px, `text` color, `lineHeight: 1.55`, `maxWidth: 440`.
- **First sentence at `fontWeight: 700`** — the operative term gets
  weight without needing a heading.
- Preserve author line breaks (`whiteSpace: 'pre-wrap'`).
- Empty `d.notes` renders neither label nor body.

---

## 4. Financial model

### 4.1 Extend `InvoiceRenderData`

```ts
depositType?: 'percentage' | 'fixed' | 'none';
depositValue?: number;      // 40 (percent) | 500.00 (fixed)
depositAmount?: number;     // COMPUTED upstream, never parsed
paymentsReceived?: number;
amountDueNow?: number;      // COMPUTED upstream
```

Computed by whatever builds `InvoiceRenderData` — the same place
`subtotal` and `taxAmount` are built today. Templates read, never
derive.

### 4.2 Calculation

```
lineAmount    = qty × unit_price
subtotal      = Σ lineAmount
total         = subtotal + taxAmount

depositAmount   percentage → round(total × depositValue / 100, 2)
                fixed      → min(depositValue, total)
                none       → 0

remaining     = total − depositAmount
```

Assert `depositAmount + remaining === total` after rounding.

### 4.3 `amountDueNow` drives the dominant block

| State | `amountDueNow` | Label |
|---|---|---|
| Quote, no deposit | n/a | `Quoted total` |
| Quote, deposit required | `depositAmount` | `Deposit due now` |
| Invoice, nothing received | `total` | `Total due` |
| Invoice, deposit received | `total − paymentsReceived` | `Balance due` |
| Invoice, paid in full | `0` | `Paid` |

The accent-filled block shows **`amountDueNow`**, not `total`. The
total moves up into the subtotal rows as context.

This is the highest-value change in this document.

### 4.4 `Totals` — required structure

```
Subtotal                      $400.00
Tax (8.25%)                    $33.00     ← only when taxRate > 0
─────────────────────────────────────
Project total                 $433.00     ← only when a deposit applies
40% deposit required          $173.20
Remaining balance             $259.80
┌───────────────────────────────────┐
│ DEPOSIT DUE NOW       $173.20     │     ← accent fill, onColor(accent)
└───────────────────────────────────┘
```

With no deposit, rows 3–5 vanish and the accent block reads
`Quoted total` / `Total due` with `total` — identical to today.

- `width: 260` is too narrow for `Remaining balance $1,117.00`.
  Widen to **300**.
- Deposit rows sit directly beneath the totals with no gap. One
  visual unit.
- The whole block is atomic for pagination (section 6.4).
- `depositAmount` of 0 renders nothing deposit-related. No `$0.00`
  rows.

### 4.5 Deposit note versus deposit logic

If `depositType` is set, the deposit rows render **regardless of
what the note says**. The note may still explain the policy — "A
deposit is required before materials are ordered" — but it is never
the only place the deposit appears, and it never carries the
arithmetic.

---

## 5. Dates

### 5.1 Format

`issuedDate` and `dueDate` arrive as **pre-formatted strings** and
the templates print them verbatim. So the `9/9/2026` vs `2026-10-09`
mismatch originates **upstream**, not in these templates.

Fix at the source. One `formatDate()`, one format, `M/D/YYYY`,
applied to both before they enter `InvoiceRenderData`.

### 5.2 Semantics — a quote has no due date

`Meta` renders `Due {dueDate}` for both kinds. Industrial appends
`· DUE {dueDate}` to its type bar. Both are wrong on a quote, which
prints `ESTIMATE — NOT A BILL` a few lines away. The document
contradicts itself.

| `kind` | Label | Source |
|---|---|---|
| `invoice` | `Due` | `dueDate` |
| `quote` | `Valid until` | `validUntil` (new field) |

Null field → row does not render. Do not substitute, do not compute
a default.

---

## 6. Pagination

### 6.1 Preserve `data-pdf-link`

`elementToPdf()` measures `[data-pdf-link]` nodes against the live
DOM and maps them with a single `794 / elRect.width` ratio. Any
multi-page rewrite **must re-measure per page node** and attach
annotations to the correct `jsPDF` page, or every Cash App, PayPal,
Venmo, and website link stops working.

This is the constraint most likely to be missed. Call it out in the
PR.

### 6.2 Immediate fixes, independent of pagination

1. `toDataURL('image/png')` instead of JPEG 0.92.
2. `scale: 3` instead of 2. Measure file size; if a 20-line invoice
   exceeds ~2MB, fall back to 2.
3. Await logo `decode()` before capture. `useCORS: true` is set, but
   nothing waits for the Supabase-hosted image — a slow load yields
   a blank logo box.

### 6.3 The page model

Replace the single `addImage(..., 0, 0, 794, 1123)` with:

1. Render into an off-screen container at 794px, `minHeight`
   removed so it grows naturally.
2. Measure every breakable block via `getBoundingClientRect()`:
   masthead, meta band, each `<tr>`, totals, notes, payment block,
   footer.
3. Usable height = `1123 − padding − continuationHeader − footer`.
4. Greedily assign blocks to pages under 6.4.
5. Build one DOM node per page.
6. `html2canvas` each page node separately.
7. `pdf.addPage()` per capture, each at 1:1.
8. Re-run link annotation per page against that page's node.

**Never scale to fit.** A block that does not fit moves.

### 6.4 Break rules

| Rule | Behavior |
|---|---|
| Table rows | Never split. Row moves whole. |
| Table header | Repeats on every page carrying rows. |
| Widows | Min 2 rows after a break; else pull 2 forward. |
| Orphans | Min 2 rows before a break. |
| Totals block | Atomic, deposit rows included. |
| Notes | Atomic if it fits; else break between paragraphs only. |
| Payment block | Atomic. Final page only. Never repeated. |
| Totals + payment | Together. If both do not fit, both move. |
| Near-empty final page | Pull the last 2 rows forward. |
| Continuation header | Business name + document number only, ~50% of full masthead height. Not the logo block. |
| Page indicator | `Page N of M`, `muted`, only when M > 1. |

### 6.5 Ledger is a special case

Ledger's invoice layout is a two-column flex with a 200px payment
rail on the right. That does not paginate like a single-column flow.

For Ledger: the rail renders on **page 1 only**; pages 2+ drop to
single column. Note this explicitly rather than discovering it in
testing.

---

## 7. Layout

### 7.1 Classic header

Currently six centered stacked elements: logo at `height: 128`,
business name at 30–42px, slogan, website, a 3px rule with 24px
margins, then a centered `DocTypeMark` at `size 24`. Roughly the top
third of the page before a line item appears.

- Logo `height: 128` → **96**.
- Logo and business name on one horizontal row, left-aligned.
  Slogan and website stack beneath the name.
- Keep the rule.
- `DocTypeMark` stays centered below.
- Target: header band **≤ 225px** (20% of 1123). Measure it.

### 7.2 Vertical distribution

Classic pins the thank-you line at `bottom: 40` absolute and
`Branding` at `bottom: 14`, while the payment block sits wherever
the flow leaves it — hence the large gap on short documents.

Final page only: content flows from the top; totals, notes, payment
block, and footer anchor to the bottom; slack collects in the
middle.

### 7.3 `PaymentBlock` width assumption

The instruction column is `width: 182` with `whiteSpace: 'nowrap'`.
"Send from your bank app" fits; a longer future string will not. Use
a min-width and let the detail column shrink instead.

---

## 8. Blocking conditions

No render, no download, when:

1. `clientName` is empty or matches a placeholder (`Client`,
   `Customer`, `N/A`). Note `generate.ts`'s `safe()` helper defaults
   the *filename* to `'Client'` — that is fine; the document body
   must never show it.
2. Any `lineItems[i].qty` or `.unit_price` is non-finite.
3. `depositAmount + remaining !== total`.
4. `Σ(qty × unit_price) !== subtotal`.

Block with a message naming the missing field. Never render a
partial document.

---

## 9. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Cyril's theme, bg `#1A1A1A` | Business name near-white; header bar darker than body text; footer legible |
| 2 | Full `PALETTE` × background matrix | All five assertions in 2.5 pass |
| 3 | Sunshine Yellow background | `text` black, `accentInk` legible, no white-on-yellow |
| 4 | 1-line quote, all 4 templates | Renders as today, one page, no page indicator |
| 5 | 20-line invoice | Multi-page, no squashing, header repeats, no split rows |
| 6 | 40-line invoice, Ledger | Rail on page 1 only, single column after |
| 7 | 20-line invoice, links | Every payment and website link tappable on its own page |
| 8 | Quote, 40% deposit, $433 total | `Deposit due now $173.20`; `Remaining balance $259.80` |
| 9 | Quote, no deposit | `Quoted total`, no deposit rows, identical to today |
| 10 | Fixed $500 deposit on $400 total | Clamped to $400, remaining $0.00 |
| 11 | Invoice, $173.20 received | `Balance due $259.80` |
| 12 | Quote document | Meta reads `Valid until`, never `Due`; Industrial type bar likewise |
| 13 | Null date | Row absent, nothing substituted |
| 14 | 400-char note | 14px, lead sentence bold, line breaks preserved |
| 15 | Empty note | No `NOTES` label |
| 16 | Empty client name | Send and download blocked |
| 17 | Same invoice, all 4 templates | Identical figures, dates, deposit math |
| 18 | PNG vs JPEG output | Visibly cleaner glyph edges on a dark background |
| 19 | Slow logo load | Logo present, not blank |
| 20 | 90-char description | Wraps, no truncation, no font shrink |

---

## 10. Build order

Strictly sequential. Each phase merges before the next begins.

| Phase | Contents | Why here |
|---|---|---|
| 1 | 6.2 — PNG, scale 3, logo await | Three lines in `generate.ts`. Immediate visible gain, near-zero risk. |
| 2 | 2.1–2.5 — tokens | Fixes the gray name, the bright header bar, the invisible footer. |
| 3 | 3.2–3.4 — tracking, size floors, notes | Small, visual, independent. |
| 4 | 4.1–4.5 — financial model and deposit | Schema change plus `Totals` rewrite. Highest value. |
| 5 | 5.1–5.2 — dates | Upstream fix plus label logic. |
| 6 | 7.1–7.3 — header and distribution | Layout, after color is correct so you can judge it. |
| 7 | 6.1, 6.3–6.5 — pagination | Largest and riskiest. Alone, last. |

Do not merge phase 7 with anything else.

---

## 11. Explicitly out of scope

- Replacing html2canvas/jsPDF with a vector renderer. Output is a
  bitmap; text is not selectable. Known and accepted here. Changing
  it is a separate architectural decision.
- Receipts, progress invoices, document status systems. New document
  types are a product decision, not a PDF fix.
- Sections and section subtotals on line items.
- `summary-template.tsx` — it has its own rules (white paper, black
  ink, accent in exactly three places) and no phase here touches it.
