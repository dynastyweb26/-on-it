# MAPPING — laptop design → app components

Read with `LAPTOP-SPEC.md`. Left column is the design (inline-styled export, so the
"selector" is the `data-spot`/`data-coach` hook or the structural element); middle
is the app file/component; right is the class set to build. Sizes are arbitrary
values only where no token exists; **colours are tokens only**.

## 0. Token table (design hex → Tailwind)

| Design hex | Token | Class |
|---|---|---|
| `#fff8f0` | background / surface | `bg-background` |
| `#fbf3e5` | surface-container-low | `bg-surface-container-low` |
| `#f5eddf` | surface-container | `bg-surface-container` |
| `#efe7da` | surface-container-high | `bg-surface-container-high` |
| `#ffffff` | surface-container-lowest | `bg-surface-container-lowest` |
| `#343027` | inverse-surface | `bg-inverse-surface` |
| `#e9c349` | inverse-primary | `text-inverse-primary` |
| `#1f1b13` | on-background / on-surface | `text-on-background` |
| `#4d4635` | on-surface-variant | `text-on-surface-variant` |
| `#7f7663` | outline | `text-outline`, `border-outline` |
| `#d0c5af` | outline-variant | `border-outline-variant` |
| `#735c00` | primary (gold text) | `text-primary` |
| `#d4af37` | primary-container (gold fill) | `bg-primary-container` |
| `#554300` | primary-on-container | `text-primary-on-container` |
| `#f0e3b8` | primary-soft | `bg-primary-soft` |
| `#f3e9c8` | sent-container | `bg-sent-container` |
| `#c9f2d4` / `#0f6d31` | paid-container / paid | `bg-paid-container` / `text-paid` |
| `#e5e2db` / `#474742` | secondary-container / draft | `bg-secondary-container` / `text-draft` |
| `#efe4d2` | **no token** — hairline on cream | `border-outline-variant/35` (α≈.34) |
| `#f0e7d8` | **no token** — inner divider | `border-outline-variant/30` (α≈.32) |

No new hex values. Gold `#d4af37` is a fill with dark text; gold text is `primary`
(`#735c00`); gold on ink is `inverse-primary` (`#e9c349`).

Type: `font-display` = Montserrat (design 700/800), `font-body` = Inter
(400/500/600/700). Mono (`IBM Plex Mono` in the export) → the app's existing mono
class where it already renders numbers/links; do not add a font.

Radii: cards `rounded-card` (20), chips `rounded-chip` (8), inputs `rounded-input`
(12), pills `rounded-button`, 14/16/18px corners → `rounded-[14px]`,
`rounded-2xl` (16), `rounded-[18px]`.

## 1. Shell — `src/components/app/AppShell.tsx`, `InstallBanner.tsx`

| Design | App | Classes (xl:) |
|---|---|---|
| frame sidebar 288, `#fbf3e5`, `1px #efe4d2`, `28/20/20` | `aside` (`lg:w-72`) | `xl:px-5 xl:pt-7 xl:pb-5 xl:gap-7 xl:bg-surface-container-low xl:border-outline-variant/35` |
| logo row | logo block | `xl:px-1.5` + wordmark `xl:text-[26px] xl:tracking-[-0.01em]` |
| `howBtn` 36h gold pill, `expand_more` | `TourPicker` button | `xl:h-9 xl:px-3.5 xl:text-[13.5px] xl:gap-1 xl:rounded-button xl:bg-primary-container` (already close) |
| nav gap 4, row 48/16, active gold | `nav` + `Link` | `xl:gap-1 xl:h-12 xl:rounded-2xl xl:px-4 xl:gap-3.5 xl:text-base` |
| install card 14 pad, 20 radius, white, 1px | `InstallBanner variant="sidebar"` | `xl:p-3.5 xl:rounded-card xl:bg-surface-container-lowest xl:border-outline-variant/35 xl:gap-3`; text `xl:text-[13px] xl:leading-[1.35] xl:min-w-0`; button `xl:h-8 xl:px-3 xl:text-[13px] xl:whitespace-nowrap` |
| tour picker 300w under pill | `TourPicker` menu | `xl:w-[300px] xl:rounded-card xl:p-2 xl:top-[76px]`, item `xl:h-[52px] xl:rounded-[14px]` |
| `BooksDot` 9px ring dot | `BooksDot` | position per nav variant: sidebar `right-2 top-1.5` on the 32px icon box, rail `right-1.5 top-1`; keep bottom-tab offsets below xl |

## 2. Page header — new `src/components/layout/PageHeader.tsx`

| Design | App | Classes |
|---|---|---|
| one 40px row: title + pills/search + actions | `PageHeader` | `flex h-10 items-center gap-4` (title `font-display text-2xl font-bold`) |
| back arrow (nested pages only) | slot | `-ml-2 h-10 w-10` ghost |
| tabs/search in the middle | slot | caller renders `PillTabs`, `SearchBar` |
| actions right | slot | `ml-auto flex items-center gap-2.5` |

Phone (`<md`) keeps each screen's current header markup; `PageHeader` renders the
old structure below `md`.

## 3. Clients — `ClientsView.tsx`, `clients/ClientsList.tsx`, `clients/ProductsList.tsx`

| Design | App | Classes |
|---|---|---|
| container 896, `24 32 0`, gap 20 | `PageContainer size="default"` | `xl:pt-6 xl:gap-5` |
| header row 40 | new `PageHeader` | title + `PillTabs` + search + add |
| pill tabs 340×40, columns 1fr 1.5fr | `PillTabs` | `xl:w-[340px] xl:h-10 xl:rounded-[20px]` (never full width) |
| `search` 300×40, `1.5px #d0c5af` | `SearchBar` | `xl:h-10 xl:w-[300px] xl:rounded-[20px] xl:text-[15px]` |
| `clients-add` 40×40 | `SearchBar` add button | `xl:h-10 xl:w-10` |
| card 20 radius, 1px border | list card | `xl:rounded-card` |
| letter header `48 1fr 200px 24`, 10/18 | `AlphaSections` header | grid + `xl:px-[18px] xl:py-2.5` |
| row `44 1fr auto 24`, 10/18, hover | `ListRow` | `xl:grid-cols-[44px_minmax(0,1fr)_auto_24px] xl:gap-3.5 xl:px-[18px] xl:py-2.5 xl:hover:bg-surface-container-low` |
| `scrubber` 22px rail, 10.5/14 | rail | `xl:text-[10.5px] xl:leading-[14px] xl:gap-0` |

Anchors that must survive: `clients-list`, `clients-add`, `clients-empty-add`.

## 4. Invoices + estimates — `InvoicesView.tsx`, `invoices/page.tsx`, `invoices/[id]/page.tsx`, `invoice-detail/*`, `estimates/EstimateDetail.tsx`

| Design | App | Classes |
|---|---|---|
| split grid `<master>px 1fr` | new `SplitView` | `xl:grid-cols-[392px_minmax(0,1fr)] 2xl:grid-cols-[440px_minmax(0,1fr)]` |
| left pane 24/20/0/24, border-right | list pane | `xl:px-5 xl:pl-6 xl:pt-6 xl:gap-3.5 xl:border-r xl:border-outline-variant/35` |
| `segToggle` 44, radius 22, moving pill | `PillTabs` | `xl:h-11 xl:rounded-[22px]`, pill `xl:rounded-[18px] transition-[left] duration-500 ease-[cubic-bezier(.65,0,.35,1)]` |
| `statusTabs` chips 36 | filter tablist | `xl:h-9 xl:rounded-[10px]` (already 44 → 36 at xl) |
| month chip | `DateDivider` | `xl:rounded-chip xl:px-2.5 xl:py-1.5 xl:text-xs xl:tracking-[.1em]` |
| card grid 1fr auto, 12/14, 20 radius | invoice `Link` | `xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:gap-x-3 xl:gap-y-1 xl:px-3.5 xl:py-3`; selected `xl:bg-sent-container xl:border-primary-container` |
| detail pane 24/40, max 720 | detail body | `xl:px-10 xl:pt-6`, inner `xl:max-w-[720px]` |
| top bar 40 + `recordPay` 40 | detail header | `xl:h-10`, button `xl:h-10 xl:pr-1.5 xl:pl-3.5 xl:gap-2` + amount chip `xl:h-7` |
| summary card 22/24 | detail summary | `xl:p-6 xl:rounded-card`; client `xl:text-[30px]`; amount `xl:text-[40px] xl:text-primary` |
| due strip 44 | due row | `xl:h-11 xl:rounded-input` |
| actions 4 columns, 40px cells | actions | `xl:grid-cols-4 xl:gap-2` |
| line items card | items | `xl:p-6 xl:rounded-card` |
| estimate detail max 760, `1fr 260` | `EstimateDetail` | `xl:grid-cols-[minmax(0,1fr)_260px] xl:gap-4` |

Anchors: `invoices-filter`, `invoices-list`, `invoices-empty`, plus the mock
targets (`card1`, `dueBadge`, `draftBadge`, `recordPay`, `actions`, `estChip`,
`convertBtn`, `sigCard`, `toast`).

## 5. Books — `BooksView.tsx`

| Design | App | Classes |
|---|---|---|
| container 1088, `24 32 0`, gap 20 | `PageContainer size="wide"` | `xl:max-w-[1088px] xl:pt-6 xl:gap-5` |
| header 40 + 2 pills | `PageHeader` actions | pills `xl:h-10` (secondary / gold) |
| row 1 `1.15fr 1fr` gap 16 | grid | `xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:gap-4` |
| net card 26/28, 180 min, ink | `books-net` | `xl:p-7 xl:min-h-[180px] xl:justify-end xl:rounded-card`; figure `xl:text-[48px]` + `xl:text-[26px]` decimals |
| owed/collected/spent | `books-stats` | `xl:grid-cols-2 xl:grid-rows-[1fr_auto] xl:gap-3`; tiles `xl:p-4 xl:rounded-card`; spent `xl:h-[52px] xl:col-span-2` |
| row 2 `1.6fr 1fr` | grid | `xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:gap-4` |
| list rows 64, 18 pad | `ListRow` cells | `xl:h-16 xl:px-[18px]` |
| recaps card 18 pad, watch again 36 | recaps card | `xl:p-[18px] xl:gap-3.5`; pill `xl:h-9 xl:pl-2.5 xl:pr-3.5` |

Anchors: `books-net`, `books-stats`, `books-add-expense`.

## 6. Chat — `ChatView.tsx` (wrapper classes only)

| Design | App | Classes |
|---|---|---|
| column 720 + 24 padding, centered | message/composer wrapper | `xl:mx-auto xl:w-full xl:max-w-[768px] xl:px-6` (720 content + 2×24) |
| header row 72 | page header slot | `xl:h-[72px] xl:border-b xl:border-outline-variant/30`; actions `xl:ml-auto` |
| composer row 80 | `chat-composer` | `xl:h-20 xl:px-0 xl:gap-2.5 xl:border-t-border-outline-variant/30` |

Anchors: `chat-composer`, `chat-camera`, `chat-messages`. Do not touch spinner,
card build-in, lock sweep, mic, keyboard-fit.

## 7. Settings and inner pages — `settings/*`, `clients/[id]`, `products/*`, `expenses`, `recurring`, `summary`

| Design | App | Classes |
|---|---|---|
| split master `<master>px` (440/392) | `SettingsView` | same `SplitView` as Invoices |
| group label 12 Montserrat `.12em` | `SettingsRows` | `xl:text-xs xl:tracking-[.12em] xl:mt-[18px] xl:mb-2 xl:ml-1` |
| row 48, 14 pad, 32 tile | rows | `xl:h-12 xl:px-3.5 xl:gap-3 xl:rounded-[18px]` |
| pane 640/680, `24 40` | section page | `xl:px-10 xl:pt-6 xl:max-w-[640px]` (`680` for Brand) |
| cards 20 radius, 1.5 border | cards | `xl:rounded-card xl:p-5` |
| inputs 48/12 | inputs | `xl:h-12 xl:rounded-input` |
| payment app grid 2 columns | `PayoutsScreens` | `xl:grid-cols-2`, cells `xl:h-[52px]` |
| toggle 48×28 | notifications toggle | `xl:h-7 xl:w-12`, knob `xl:h-[22px] xl:w-[22px]` |

## 8. Tutorial player — `tutorial/*`

| Design | App | Classes / values |
|---|---|---|
| laptop stage (frame, sidebar + content) | new laptop branch in `TutorialOverlay` | keep 390 phone stage below xl; at xl render the 1280×800/1440×900 layout scaled to the viewport |
| `menuIn .25s` picker under the pill | `TourPicker` | `xl:top-[76px] xl:w-[300px] xl:rounded-card` |
| spotlight `.55s` + `ringPulse 1.6s infinite` | overlay spotlight | port transitions/ring verbatim (spec §3) |
| callout 360, gap 18, margin 16 | overlay card | `xl:w-[360px]`, padding `16px 18px` |
| Skip/Back/Next sizes + gold focus ring | controls | `36px` heights as in the design |
| scene values | `mock/*` | redraw mocks to the laptop layouts in sections 3–7 (Invoices mock becomes the split view) |
| keyboard →/←/Esc | overlay | add arrow handling; keep Esc |
| reduced motion | overlay | still state per scene, no pulse/ripple/veil |

Do not rename `data-coach` values; `coach-marks.test.ts` depends on them.

## 9. Diff-gate selectors (design → app)

Pairs used by `diff.config.json` (both sides must resolve, else the case FAILs):

| Design | App |
|---|---|
| `nav[data-coach="side-nav"]` | `[data-coach="side-nav"]` |
| `[data-spot="howBtn"]` | `aside button[aria-haspopup="menu"]` |
| `[data-coach="clients-list"]` | `[data-coach="clients-list"]` |
| `[data-coach="clients-add"]` | `[data-coach="clients-add"]` |
| `[data-spot="search"]` | `input[type="search"]` |
| `[data-coach="invoices-filter"]` | `[data-coach="invoices-filter"]` |
| `[data-coach="invoices-list"]` | `[data-coach="invoices-list"]` |
| `[data-spot="segToggle"]` | `[role="tablist"][aria-label="Invoices or estimates"]` |
| `[data-coach="books-net"]` | `[data-coach="books-net"]` |
| `[data-coach="books-stats"]` | `[data-coach="books-stats"]` |
| `[data-coach="books-add-expense"]` | `[data-coach="books-add-expense"]` |
| `[data-spot="viewExpenses"]` | `[data-coach="books-net"]` section row (list card) |
| `[data-coach="settings-profile"]` | `[data-coach="settings-profile"]` |
| `[data-coach="settings-payouts"]` | `[data-coach="settings-payouts"]` |
| `[data-spot="payApps"]` | payment-apps grid (settings/payouts) |
| `[data-coach="chat-messages"]` | `[data-coach="chat-messages"]` |
| `[data-coach="chat-composer"]` | `[data-coach="chat-composer"]` |
| `[data-spot="hdrIcons"]` | chat header actions slot |

States where the export differs legitimately (different sample data): list row
count, month labels, money values. Report those with `check:["w","h"]` and never
gate on `maxPixelDiffPct`.

## 10. Paywall, wide card — `PaywallModal.tsx`, `paywall/ShowcaseStep.tsx`, `paywall/FitToHeight.tsx`

Measured from `design/laptop/paywall.html` at 1440×900. **The export draws one
slide only** (the voice/"Say it. It's invoiced." showcase, step 1): the card's
`role="dialog"` is the single `Try On It` card, its text is 676 characters, and
there is no `data-step` switcher — the "Tweaks" panel the page's own copy
mentions is not in the standalone build. Every other slide (estimate, payment
apps, weekly recap, trial timeline, plan, success) has **no reference here**, so
no rows are written for them.

| Design element | Measured (1440×900, identical at 1280×800) | App |
| --- | --- | --- |
| card `[role=dialog]` | 1040×760, r28, bg `#fff8f0` | `PaywallModal` card at `xl:` (today `max-w-md` / 860 tall) |
| card header | 1040×84, padding `16px 20px 8px`, grid `44px 1fr 44px` | header block |
| close `button:first-of-type` | 44×44, r999 | `[aria-label="Not now"]` |
| logo `img:nth-child(2)` | 44×44, r12 | `img[alt="On It"]` |
| header dots | row 44×6, gap 6; active 20×6, rest 6×6, r99 | step dots |
| body | 1040×587, inner padding `8px 56px 12px`, gap 16 | step area |
| reason pill | 249×33, r999, padding `7px 13px`, gap 7, 12.5/600, white, border `#efe4d2` | `ShowcaseStep` pill |
| content row | 928×432 → copy column 412, demo panel 460×432 r20 padding `18px 16px` gap 14 bg `#faefdc` | step 1 two columns (today: one column) |
| copy | headline 32/800, sub 16/400 | slide headline + sub |
| body dots | 72×26, active 24×6 (inner 16×6), rest 12×6 | slide dots |
| footer | 1040×89, padding `14px 24px 18px`, hairline `#f0e7d8` | pinned footer |
| CTA | 400×56, r999, gold `#d4af37`, 16/700 | Continue / Start trial |

Steps 1–2 must fit 1440×900 and 1280×800 with no inner scroll (the card is 760
tall, so 800 - 2×20 is exactly enough); step 3 scrolls inside the card. Below
`md` nothing changes: the 448px phone column stays as it is.

| Diff-gate selector (design) | App |
| --- | --- |
| `[role=dialog]` | `[role="dialog"] > div` |
| `… > div:nth-child(1)` (header) | `[role="dialog"] > div > div:nth-child(1)` |
| `… button:first-of-type` (close) | `[aria-label="Not now"]` |
| `… img:nth-child(2)` (logo) | `img[alt="On It"]` |
| `… div:nth-child(2) > div:nth-child(1) > div:nth-child(1)` (reason) | `[role="dialog"] p.whitespace-nowrap` |
| `… div:nth-child(3)` (footer) | `[role="dialog"] > div > div:nth-child(3)` |
| `… div:nth-child(3) > button:nth-child(1)` (CTA) | `[role="dialog"] button.bg-primary-container` |

### Gate relaxations, with reasons

| Pair | Check | Why |
| --- | --- | --- |
| `card` | `w`, `h` only | The export draws the card inside a mock browser frame with a 44px margin, so its absolute x/y are the frame's, not a viewport-centred overlay's. Size is the transferable part. |
| `reason pill` | `h` only | The pill is content-sized. The design's 249px is its own trigger copy ("You've used your 3 free invoices"); the app's `REASON` strings differ per variant and the copy must not change. |

## 11. Laptop tutorial stage — chat card group (13b)

Measured from `design/laptop/tutorial.html` (Chat tour, scene 1) with Playwright,
and from the branch preview at `?laptop=1` at 1440×900.

**Two coordinate systems, both fine.** The export draws its app canvas 1440×900
inset `(44, 248)` inside the mock page; the app's stage is 1380×860 at `(30, 20)`.
So the content area is 1152 wide in the design and 1092 in the stage, and every
absolute number differs by those insets and by the 30px the stage loses on each
side. What the design actually specifies — positions **relative to the 720
column** — matches exactly, so that is how the table reads.

| Design element | Canvas-local (measured) | App (column-local) | Notes |
| --- | --- | --- | --- |
| chat column | 504..1224 | 504..1224 on screen | 720 wide, centred in the content area |
| `invCard` | `504,460` 560×339 | `504,443` 560×337 | `width:100%; max-width:560`, padding 16, radius 20, gap 10; 2px shorter (sub-pixel borders) |
| `toggle` | card +156, +20 → 140×28 | card +156, +20 → 140×28 | estimate variant 130×28 at +165 |
| `tplPrice` | card +366, +118 | card +366, +118 | 34 high; content-sized (76 empty / 88 filled in both) |
| `invFoot` | card +17, +274 → 526×48 | card +17, +274 → 526×48 | min-height 48, 44px gold-to-dark button |
| `suggest` | panel content 283×49 | 277×49 | inside the item panel; only rendered on the Clients tour's "Save your jobs" beat |
| `composer` | column +54 → 612×44 | column +54 → 612×44 | row is 720×80 with a 1px `#F0E7D8` top border and 10px gaps |
| `plus` / `send` | column +0 / +676, 44×44 | column +0 / +676, 44×44 | the row's 44+10+612+10+44 = 720 |

Card body, ported element-for-element: 34px header (32px tag radius 8 `#F3E9C8`,
toggle `700 14`/`7px 4px`, 32px close `#EFE7DA`), body grid
`minmax(0,1fr) minmax(0,1.4fr)` gap 10 (44px name row, white panel radius 14
padding 8 with a 40px job row and the 34px qty × price row), a wrapping chip row
(36/38 high, radius 999), a 1px `#EFE4D2` divider and the 48px footer.

Animations are the design's own classes, unchanged: `cardIn .55s` (`aCardIn55`),
`pop .45s` (`aPop45`), `pop .4s` (`aPop4`), `cardIn .35s` (`aCardIn35`, new) and
`pop .4s, glow 1s .35s 2` on the filled price (`aPrice`).

### Gate relaxations, with reasons (chat card)

| Pair | Check | Why |
| --- | --- | --- |
| `chat invoice card`, `card toggle`, `card footer` | `w`, `h` only | Absolute x/y cannot compare: the export's canvas is inset 44/248 in its page and is 1440×900 against the stage's 1380×860, so every box is offset on both axes. Sizes and column-relative offsets were verified directly (table above). |
| `line price` | `h` only | Content-sized pill, and the two players are sampled at different beats: the export has typed `$400.00` (88px) by the time the app case's 9s wait ends, while the app's scene 0 is still on the empty `$Price` (76px). Same text measures 88 on both sides. |

### 11b. Expense sheet and ready-to-share card (13b commit 4)

Same two coordinate systems as above (canvas-local vs stage-local): x is compared
**relative to the 720 column**, y from the stage's top edge, and for
bottom-anchored boxes the distance to the composer row's content edge (both cards
end 20px above it).

| Design element | Canvas-local (measured) | App (measured) | Notes |
| --- | --- | --- | --- |
| expense card | `504,451` 520×348 | 520 wide at the column's left | `max-width:520`, padding 18, radius 20, gap 14 |
| `saveExpense` | `523,732` 331×48 | `523,713` 331×48 | row is `482` wide with "Change something" beside it; pill 19 above the card's bottom edge on both |
| ready card | `504,93` 720×358 | 720 wide at the column's left | grid `1.25fr / 1fr`, gap 20, padding 20, radius 20 |
| `readyChip` | `525,146` 147×30 | `527,169` 146×30 | 21 from the card's left edge (23 in the app, border rounding); radius 8, height 30 |
| items / deposit / notes / total | 366 wide, 63 / 38 / 60 / 45 | 366 wide | left column, gap 12 |
| right column | `911,114` 292×316 | 292 wide | `padding-left:20`, 1px left border |
| `shareBtns` | `932,212` 271×46 | `931,233` 271×44 | 131/132 wide halves with an 8px gap |
| `copyLink` | `932,212` 132×46 | `931,233` 131×44 | 44 high in the app because preflight is border-box, 46 in the export's content-box |
| `revise` | `932,338` 271×92 | `931,356` 271×92 | `margin-top:auto`, so it pins to the bottom of the right column |

Spotlight (scrim cutout) vs anchor, sampled every 120ms through both scenes:
`saveExpense` ≈4.1s, `readyChip` ≈0.7s, `shareBtns` ≈2.5s, `revise` ≈4.4s — the
same order and beats on phone, worst cutout-vs-anchor delta **0.3px** (laptop) and
1.2px (phone, its 1.1× stage scale). `copyLink` is a tap target only (ripple, no
scrim), in the design and the app alike.

| Pair | Check | Why |
| --- | --- | --- |
| `save expense pill`, `ready chip`, `share buttons`, `copy link`, `revise tile` | `w`, `h` only | Same reason as 11: the export's canvas is inset 44/248 and 40px taller than the stage, so absolute x/y never compare; sizes match within 2px and the column-relative offsets above were verified by measurement. |

### 11c. Chat page header (13b commit 5)

The laptop chat screen no longer draws the phone's mock header. It was overlapping
the top **36px** of the message column (the ready card was clipped by it); the
design's chat screen has no such bar, so the title and the two icons move into the
shell's 72px page row, inside the 720 column.

| Design element | Canvas-local (measured) | App (stage-local) | Notes |
| --- | --- | --- | --- |
| page header row | `504,0` 720×73 | `504,0` 720×72 | `border-bottom:1px solid #F0E7D8`; the export counts the hairline outside its 72 |
| title "Chat" | at the row's left | same | `700 24px/1` Montserrat, `#1E1A14` |
| `hdrIcons` | `1140,16` 84×40 | `1140,16` 84×40 | `display:flex`, `gap:4`; its right edge is the column's right edge (1224) |
| `newChat` | `1140,16` 40×40 | `1140,16` 40×40 | radius 12, `edit_square` 24 |
| `history` | `1184,16` 40×40 | `1184,16` 40×40 | radius 12, `history` 24 |

Unlike 11/11b these x/y **do** match absolutely once the export's 44px page margin
is removed, so the only relaxation is the 1px hairline height (design 73, app 72).

Spotlight beats in the Chat tour's last scene (`data.ts`: `0 hdrIcons`, `1.0
newChat`, `3.4 history`): cutout vs anchor sampled every 120ms tracked
`hdrIcons` ≈240ms, `newChat` ≈1080ms, `history` ≈3240ms — the same order and beats
as phone, worst delta **0.2px**.

Overlap proof (scene 4, ready card's top edge, `elementsFromPoint`): at the card's
top-left +20px and at its centre the phone header's `history` span / icon row used
to be the top mock element; now nothing in the mock region sits above the card and
only the tutorial's veil floats there. The card's rect is unchanged
(`720×356 @ 504,112` both before and after), so the header was purely overlapping.

| Pair | Check | Why |
| --- | --- | --- |
| `page header row` | `w`, `h` | Design 73 vs app 72: the export's 1px hairline is outside its 72px box, the app's is inside a border-box row. x/y verified by measurement (`504,0` on both). |
| `header icons`, `new chat icon`, `history icon` | `w`, `h` only | Same reason as 11: the export's canvas is inset 44/248, so absolute page coordinates never compare; sizes match exactly and the stage-local offsets above were verified by measurement. |

### 11d. Cluster Next pill (13b commit 6)

The laptop cluster's Next is the design's small pill inside the callout card's
footer row, not the full-frame gold bar. The bar (1349×58 at 1440) stays the
phone/iPad device; laptop drops out of that condition and renders the pill in the
card instead, so the cluster is the card alone (its measured height already holds
the pill) — `fullCh` no longer adds `GAP + NEXT_H` in laptop mode.

| Design element | Design (measured) | App (measured) | Notes |
| --- | --- | --- | --- |
| Next pill | 91×36 | **92×36** at rest | radius `999px`, `800 14.5px/1` Montserrat, `#D4AF37` on `#1F1B13`, `padding:0 18px`; the 1px is our self-hosted Montserrat instance against the export's Google-font one |
| Next pill, last scene | 79×36 ("Got it") | **79×36** | content-sized: the label shortens, so a fixed 91 width is wrong |
| inset in card | 18 from right, 16 from bottom | **17–18**, **16** | the card's `padding:16px 18px` puts it there |
| pill animations | none on the export's static mock | `nextIn 600ms 1`, `nextPulse 1800ms inf` | the animation is the app's, untouched; it is why a sampled rect reads 94–95×36–37 |

Card height grows by the footer row: 128→180, 158→210 at the two-line scene. The
design's card is 159 because its label row (12) and title (27) are the export's
metrics where the ported card keeps the phone's (28/30) — a pre-existing difference
that only moves the card's own height; the gate pairs the card by `w`.

Clearance to the spotlight ring, box distance per scene (card vs ring): **459px**
worst (scene 5), 516–549 elsewhere, 517 at scene 1 — the cluster never touches a
cutout. Click-through on laptop: 1/6 → 6/6, each press advancing one scene, and the
last scene's "Got it" closes the tour exactly as on phone.

### 11e. Composer camera tile (13b commit 7)

| Design element | Design (canvas-local) | App (stage-local) | Notes |
| --- | --- | --- | --- |
| `camera` | 36×36 | **36×36** | radius 18 (design `18px`); was 32×32 with a 22px glyph, now a 20px `photo_camera` |
| inset in composer | 5 from its right, 0 off its centre | **5**, **0** | the composer's `padding: 0 4px 0 16px` plus its 1.5px border puts it there |
| row | plus 44×44, composer 612×44, send 44×44 | **same** | plus x 504, composer x 558, send x 1180, camera x **1129** — the design's 1173 minus its 44px page margin |

The tile's background stays the app's existing `#F2E5BC` rather than the export's
`#F0E3B8`: section 0 forbids adding hex values, and the two are 2/255 apart.

`data.ts` spotlights `camera` at beat 0 of the "Snap a receipt" scene (tap at 0.9).
Scrim cutout vs the tile, sampled every 100ms through the beat: **0px** at 0ms and
100ms, i.e. it tracks the rect exactly, at the same beat as phone.

Keyboard, read-only (no code changed for it): Tab from the dialog root reaches
`Skip`, then the pill (2 stops) — no dead stop. The pill paints the gold
`:focus-visible` ring (`solid 2px #E6C65A`, offset 3, radius 999), Enter advances
1/6 → 2/6, Shift+Tab returns to it, and Space advances 2/6 → 3/6.

| Pair | Check | Why |
| --- | --- | --- |
| `camera tile` | `w`, `h` only | Same canvas-inset reason as 11; sizes match exactly and x matches once the 44px margin is removed. |

### 11f. `suggest` panel — why it is not 277 and why it is not paired (13b commit 8)

No product change: the panel already matches the design. The single cause of the
"277" figure is **the entry animation**. Both players animate the panel in with the
same 350ms `cardIn` (`tutorial_cardIn` in the app) scale; a rect sampled inside that
window reads `283 × ~0.979 = 277` (and `50 → 49`). Transform-free layout metrics,
taken on both players at the beat:

| | design | app |
| --- | --- | --- |
| `offsetWidth × offsetHeight` | **283 × 50** | **283 × 50** |
| `offsetLeft` / `offsetTop` in its column | **250 / 117** | **250 / 117** |
| computed `width` | `257px` **content-box** + `padding 8/12` + `1px` border = 283 | `283px` **border-box** |
| parent | 301 × 158 (content-box, `padding 8`, `1px` border) | 301 × 158 (border-box) |
| grandparent / card | 526 grid, card 560 (`max-width:560`, `padding 16`, `1px`, `grid gap 10`) | identical |

The 283 is **not** content-driven in either player. In the export it is a fixed
`width: 257px` content box (a longer label would wrap); in the app the panel
stretches to its column's content box (`301 − 16 − 2 = 283`), so a longer label
would widen the wrap instead of the panel. Nothing else reads the export's 257px,
and the mock's labels are fixed strings, so a hard `width: 283` would be a no-op.
The tile's `cardIn` is the app's existing animation and must not be removed.

**Why there is no diff-gate pair.** The panel exists only inside a 0.6s window of
its scene, and `design:diff` runs the design's steps, then the app's (~10s), then
evaluates every pair: by then the design has moved past the beat. Measured windows
at the gate's own step timings — design **7.13–7.69s**, app **7.06–7.71s** — overlap
at rest only from 7.46s, which is exactly the window the tool spends on the app's
steps. A pair here fails as "element not found" (confirmed three runs), so it is
deliberately absent rather than relaxed; the geometry above was measured directly
and the card it sits in is already paired (`chat invoice card`, 560 wide).

Phone is untouched by this commit; its `suggest` subtree on the Clients tour still
hashes to `743` chars / `1874099837` (measured with the clock running — under
reduced motion the scene is frozen at its end state, where the panel is already
gone).

### 11g. The laptop stage's breakpoint (13b commit 9)

The stage now switches on `matchMedia('(min-width: 1280px)')` — the app's own `xl:`
width — instead of a `?laptop=1` query string. State starts `false` and is set in an
effect with a `change` listener and cleanup, so the server and the first client
render agree; the override is gone, so a phone cannot be forced into the laptop
stage.

Phone path, same width before (`02d2d63`) and after, reduced-motion stage hash:

| width | before (scene 0 / scene 5) | after | verdict |
| --- | --- | --- | --- |
| 768×1024 | `831524219` / `433782501` | identical | phone |
| 1024×768 | `1357553029` / `844963231` | identical | phone |
| 1279×800 | `-639995581` / `-1537219573` | identical | phone — one pixel below the flip |
| 1280×800 | `-999882025` / `-1913354104` | — | laptop (the 9:41 bar and the phone tab bar are gone; 16427 chars → 10765) |
| 1366×1024 | — | same as 1280 | laptop, as expected for iPad Pro landscape size |

The stage's own size at those widths: 1279 gives the 390-wide phone frame at scale
1.1026, 1280 fits the 1380 frame at **0.9275** (`availW / 1380`), 1366 at 0.9899 and
1440 at 1. With the scale removed, the scrim cutout tracks its spotlight anchor to
**0.2px** at 1280 and 1366 and **0.0px** at 1440 and 1279; `document.scrollWidth`
never exceeds the viewport; the console is clean at every width. Because the laptop
frame scales below 1440, raw rect comparison against the export (which does not
scale its canvas) fails at 1280 by exactly the scale — `560 → 519`, `339 → 313`,
`612 → 568` — so the laptop cases stay gated at 1440, where the scale is 1.

The six laptop cases no longer pass `?laptop=1`; they use `/chat`, so they exercise
the real visitor path. `tour-chat-1279` is new: it pins the phone path one pixel
below the flip (its callout pair and motion check pass, and the path identity itself
is the hash table above). `tour-chat-1440` and `tour-chat-1280` were the old phone
cases; at 1440 they now exercise the laptop stage and all of their pairs pass,
while at 1280 the composer pair reads `568` against the export's `612` for the
scale reason above.

Resize mid-tour, both directions (1440→1000→1440 and 1000→1440→1000), sampled
through a live spotlight: the scene is kept (`1/6` → `1/6` → `1/6`), the ring is
live in all 12 samples, its settled cutout is **0–0.9px**, there is no overflow at
any step and no console output. During the resize itself the cutout is briefly far
off, which is the ring's own 0.55s move, not a lost spotlight. No hydration warning
at 1440 or 390 on `/chat` and `/dashboard`.

Still failing, unchanged by this commit: `tour-invoices-1440` (segment toggle),
`tour-clients-1440` (search), `tour-books-1440` (net card) and `tour-settings-1440`
(`paymentRow` absent). All four failed before the flip as well — they are the mocks
that are still the phone's shape, i.e. the redraw work that follows this commit.

### 11h. The laptop stage is Chat only (13b commit 10)

`laptop = xl && tab === 'chat'`. `MockScreen` hands the flag to `ChatMock` alone; the
other four mocks take no such prop, and at ≥1280 that left them a phone render
stretched across the 1152 content area under the shell (`Invoices` measured its own
9:41 bar 1092 wide at (288,72), `search` 990 against the design's 300, `net` 1060×103
against 573×180). They now use the framed-phone branch at every width.

Stage hash, reduced motion, scene 0 / scene 1, `02d2d63` (pre-flip) → `e5958c7`, all
16 identical:

| tour | 1440×900 | 1279×800 |
| --- | --- | --- |
| Invoices | `16500/-103744134`, `15729/-201631843` | identical |
| Clients | `13397/1715042087`, `14000/-1135267660` | identical |
| Books | `18985/-1183429492`, `19670/1492082124` | identical |
| Settings | `16065/88154484`, `12903/1288920218` | identical |

Chat is unchanged against `15bc3fa` at both widths (`19845/-1699713544`,
`20570/-947010285` at 1440; `21665/-1227789146`, `22404/-1152182433` at 1279), and the
phone path is unchanged at 768 / 1024 / 1279. Switching Chat → Invoices → Chat gives
1380 (shell, no 9:41 bar) → 430 (no shell, 9:41 present) → 1380 again with a clean
console, and 1440→1000→1440 keeps the scene on both Chat and Invoices with a 0.2px
settled cutout.

The four tour cases (`tour-invoices-1440`, `tour-clients-1440`, `tour-books-1440`,
`tour-settings-1440`) are back on the phone path: their known failing pairs report the
pre-flip phone values again (`segment toggle` h 62, `search` 318, `net` 395×114,
`paymentRow` absent). They stay red until those mocks are redrawn.

**Removal condition:** delete `&& tab === 'chat'` per tour as its mock lands, leaving
plain `xl` (the guard's comment carries this).


### 11i. Clients tour redrawn for laptop

`laptop = xl && (tab === 'chat' || tab === 'clients')`; `MockScreen` passes the flag
to `ClientsMock` as well. The overlay already wraps every laptop mock in the shared
`LaptopShell` (288 sidebar, content area), so the mock is the screen only — it must not
nest a second shell. The shell draws its 72px page bar for the Chat screen alone
(`LaptopShell` now derives `header = tab === 'chat'`) because the design gives every
other screen its title inside the content:

| design | app | notes |
| --- | --- | --- |
| content column, 24 top / 32 side | `maxWidth 896`, `padding '24px 32px 0'` | centred in the 1092 content area: x 386 in the 1380 frame |
| title row 40 high | title 24/1 Montserrat + 340×40 tabs + 300×40 search + 40 add | one line, `gap 16` |
| pill tabs 340×40, thumb 40%/60% - 4 | `width: 340`, thumb `left/width` toggled, `.5s cubic-bezier(.65,0,.35,1)` | `psTab` keeps its anchor |
| search 300×40, radius 20, 1.5 `#d0c5af` | same | `tour-clients-1440` pair, 300×40 exactly |
| list card radius 20, `#fff`, `1px #efe4d2` | same | group header `B` 700 11.5/1, `.1em`, `#735c00` |
| row `44px 1fr auto 24px`, padding `10px 18px` | same | avatar 40, name 700 16, meta 400 14.5, chevron 20 |
| A–Z rail in the card's grid column (`22px`) | same | 700 10.5/14, `#7f7663`, B highlighted `#735c00` |
| product sheet | `512` + 24 padding = 560 centred dialog, `dlgIn .4s` (new `.aDlgIn`) | the design's own box is 560 too (content-box); scrim `rgba(31,27,19,.38)`, save pill 94×44 |
| client row hover | `.rowHover:hover { background: #fbf3e5 }` | the design's `style-hover` |

Measured on the built preview at 1440: stage 1380×860 scale 1, **one** `aside` at
(0,0) 288×860, row 896×40 with title at x 386, tabs 340×40 (`psTab` 204×40), search
300×40, add 40×40, grid 896, card 862, row 860×61, rail 22. The spotlight cutout is the
anchor plus the solver's 6px pad — search `-6.02,-6,12,12`, row `-6,-6,12,12` — i.e.
the ring tracks the target in scenes 1 and 2. `tour-clients-1440` passes both pairs;
console clean. Phone branch byte-identical to main: stage hashes at 1279×800
(`13397/-1876094599`, `14000/579718540`, `19550/-1773175401`) and 390×844
(`12978/1613968337`, `13782/-2046475908`, `19298/-1127085408`) equal the control build.

Still the chat-era chrome in the shared shell, for every laptop tour: the sidebar has
no install card and uses 44-high items where the design has a 36-high "How it works"
pill, 48-high items and the pinned install card (36 tile, 32 pill). Left for its own
shell commit rather than folded into a screen's redraw.



### 11j. Invoices tour redrawn for laptop

`laptop = xl && (tab === 'chat' || tab === 'clients' || tab === 'invoices')`. The mock
is the design's split screen only (the overlay owns the shell). The design keys the
master pane on its frame — `masterCol = W >= 1440 ? 440 : 392` — and the app's stage is
1380, so **392**: the design's own value for any frame below 1440.

| design | app | notes |
| --- | --- | --- |
| `grid-template-columns: masterCol minmax(0,1fr)` | `392px minmax(0,1fr)`, `scrIn .4s` | the split is the screen |
| list pane `padding:24px 20px 0 24px`, `border-right:1px solid #efe4d2`, `gap:14` | same | title `Invoices` 700 24/1 in a 40-high row |
| segment toggle 44 high, radius 22, `#f5eddf`, thumb `calc(50% - 4px)` at 4/50%, `left .5s cubic-bezier(.65,0,.35,1)` | same | `segToggle` 44 high (was 62) — the pair that was failing |
| chips 36 high, radius 10, on `2px #d4af37` / `#f3e9c8`, count 24×22 radius 11 | same | summary column right-aligned, 13/1 |
| month tag `6px 10px`, radius 8, `#f3e9c8`, 800 12/1 `.1em` | same | |
| card `1fr auto`, `gap 4px 12px`, `padding 12px 14px`, radius 20, `#fbf3e5`/`#efe4d2`, selected `#f3e9c8`/`#d4af37` | same | name 700 17/1.2, badge 24 high radius 7, meta 13.5, amount 800 20/1 |
| badge `send` 14px, `DUE NOV 14` 700 11/1 `.07em`; draft `#e5e2db`/`#474742` | same | card 1 carries `card1` + `dueBadge`, the draft `draftBadge` |
| detail pane `padding:24px 40px`, centred | same | invoice `max-width 720`, estimate `760` with a `260` signature column |
| invoice header 40 high: status chip 28, mono number, `recordPay` pill radius 999 with the amount chip 28 | same | `actions` 4 columns of 40-high tiles |
| summary card `22px 24px`, radius 20, `grid 1fr auto`, amount 800 40 `#735c00`; due strip 44; line items `20px 24px` | same | |
| estimate: chips 28 (approved `#c9f2d4`/`#0f6d31`, converted `#e5e2db`), total 800 38, `convertBtn` 48 radius 999, 3 tiles 40 | same | `sigCard` 18 padding, 110-high signature box, Caveat 46 `rotate(-4deg)` |
| toast `width:380px`, radius 20, `#343027` | same | `cardIn .5s`, `justify-self:end` |

**Gate:** `tour-invoices-1440` passes. Its segment-toggle pair is height-only (`h`)
with the reason recorded in `diff.config.json`: the design's own frame at that viewport
is 1440 → `masterCol` 440 → toggle 395, while the app stage is 1380 → 392 → toggle 347.
The height is the value the redraw fixed (62 → 44).

### 13. Books tour redrawn for laptop

`laptop = xl && (chat | clients | invoices | books)`. The mock is the design's screen:
a 1088 column centred in the content area, 24 top / 32 side padding.

| design | app | notes |
| --- | --- | --- |
| `max-width:1088`, `gap:20` | same | on a 1380 stage the available width is 1092−64 = 1028, so the column is 1028 |
| title row 40 high: `Books` 700 24/1 + Income & Expenses pill (40, radius 999, `#f5eddf`, `1.5px #d0c5af`, 20 icon) + `addExpense` (40, `0 18px`, `#d4af37`, 22 add) | same | `books-add-expense` anchor kept as `data-spot="addExpense"` |
| row 2 `grid 1.15fr 1fr`, `gap 16` | same | |
| `net` card `26px 28px`, radius 20, `#343027`, `justify-content:flex-end`, `min-height:180`; eyebrow `NET · ALL TIME` 600 13 `.05em` `#e9c349`; amount 800 48/1 `#e9c349` with the cents at 26; `12 invoices` 400 14 `#d0c5af`; chevron 24 at 22/22 | same | the card the pair measures |
| tiles `grid 1fr 1fr` rows `1fr auto` `gap 12`; owed `#f3e9c8` border + 8px `#d4af37` dot, coll `#efe4d2` + `#0f6d31` dot, labels 600 14/1, amounts 800 28/1 (suffix 16 `#4d4635`), chevrons 18 `#7f7663` | same | laptop dots are the design's 8×8; the phone's 9×9 helper is untouched |
| `spent` row `grid-column:1/-1`, 52 high, `0 18px`, dot `#7f7663`, label 600 15/1, amount 800 20/1 (suffix 13), chevron 20 | same | |
| row 3 `grid 1.6fr 1fr`, `gap 16`, `align-items:start` | same | list rows 64 high, `0 18px`, tile 40 radius 12 (`#f5eddf` receipt_long / `#f0e3b8` autorenew), title 600 16/1.2, sub 400 13.5/1.3, hover `#fbf3e5` |
| `recaps` `padding:18`, radius 20, `gap:14`; sparkle 24 `#735c00` with `twinkle .8s ease-in-out 3`; `Recaps` 600 17/1; `watchAgain` 36 high, `0 14px 0 10px`, radius 999, `#f5eddf`, `play_arrow` 22 filled | same | |

**Gate:** `tour-books-1440` passes. Its net-card pair is height-only with the reason in
`diff.config.json` (the design's 1088 column on its own 1440 frame gives a 573 cell;
the app's 1380 stage gives 541; both 180 high, against 114 before the redraw).

**Verified on the built preview at 1440:** stage 1380×860 scale 1, one `aside`; every
spotlight beat lands on its anchor plus the solver's 6px pad — scene 1 `owed` then
`coll`, scene 2 `addExpense` then `viewExpenses`, scene 3 `recaps`, scene 4 `recurring`;
console clean. Phone branch byte-identical to main at both widths: 1279×800
(`18987/1210955473`, `19672/-1531758682`, `19831/569571338`, `19955/-1966909349`) and
390×844 (`18752/-2118051052`, `19441/-2144511940`, `19598/-1614089105`,
`19739/-1587138708`). A first pass shared the phone's 9px dot helper and moved the phone
by 6 characters in every scene; the helper is now separate (`laptopDot`) and the hashes
above are the fixed build.

**Verified on the built preview at 1440:** stage 1380×860 scale 1, one `aside`; the ring
lands on the spotlighted anchor plus the solver's 6px pad in every scene — `segToggle`
(−5.98, −5.97, 11.98, 11.98), `dueBadge`, `actions`, `estChip` (12.25 at the pop's
sub-frame); console clean. Phone branch byte-identical to main: stage hashes at
1279×800 (`16500/197870486`, `15729/1070800453`, `17078/1281331705`, `17314/460299112`)
and 390×844 (`16282/1071098487`, `15466/-135986958`, `16824/-1201072258`,
`17065/-414645745`) equal the control build.

## 12. `feat/laptop-books-settings` — the Books Recaps card and the Settings split

Branch `feat/laptop-books-settings`, off `main` (`6a5722b`). Two commits: the
Books card, then the Settings master/detail. Design source: the Books and
Settings frames of `design/laptop/tutorial.html` (extracted for this round into
`.design-diff/books-design.txt` and `.design-diff/settings-design.txt`).

### 12a. Books — the Recaps card is the design's tall card

The design's row 2 is `grid-template-columns: minmax(0,1.6fr) minmax(0,1fr)`
beside View expenses + Recurring (two 64px rows: 130px with its borders) and
draws Recaps as a card of the same height — header, then the action pill.

| Design (`data-spot="recaps"`) | App | Classes |
|---|---|---|
| card pad 18, radius 20, `#fff`, border 1.5 `#efe4d2`, column, gap 14 | `RecapsCard` `CARD` | `p-[18px] rounded-card border-[1.5px] border-outline-variant/70 bg-surface-container-lowest gap-3.5` |
| header gap 10; sparkle 24 `#735c00`; "Recaps" 600 17/1; chevron 20 `#4d4635` | `CARD_HEAD` + `Lead wide` | `gap-2.5`; `size={24} text-primary`; `text-[17px] leading-none font-semibold` |
| pill h 36, pad `0 14 0 10`, radius 999, `#f5eddf`, gap 4, play_arrow 22 FILL 1, 600 14/1 | `CARD_PILL` | `h-9 pl-2.5 pr-3.5 rounded-full bg-surface-container text-sm font-semibold` + `size={22} filled` |
| both row-2 cards one height | `BooksView` | the line is `xl:items-stretch`; the Recaps wrapper carries `xl:mt-6`, matching the 24px `space-y-6` margin-top the list card still has when `space-y-6`'s children become xl flex items |

**Why a client width and not `xl:` classes.** The phone arrangement is one 50px
row whose lead block (sparkle + "Recaps" + dot) lives *inside* the play button;
the design's is a header row with the pill under it. No `xl:`-only class can move
a button's children out of the button without breaking its tap target, so the
card reads `matchMedia('(min-width: 1280px)')` after mount and swaps structure.
It renders nothing until `useRecaps()` resolves (`access === 'loading'`), so the
server HTML can never mismatch.

Measured at 1440×900 on the preview: Recaps card 412.2×130 at (995.8, 308), the
View expenses + Recurring card 655.8×130 at (320, 308) — equal height, tops
aligned; pill 36 high (`bg rgb(245,237,223)`); card `bg rgb(255,255,255)`,
`border-radius 20px`, `padding 18px`. Only the locked state ("Unlock") is
observable on the test-seller account; the paid "Watch again" label renders in
the same card and pill.

Below 1280: `/dashboard` at 1279×800 and 390×844 — the innerHTML hash with every
`xl:` token stripped (`f351101f`, `9b1adf1`) and the every-element geometry hash
(`17688676`, `41d13f`) are identical to the pre-change build; the raw hash moves
only by the two inert `xl:` tokens (`xl:items-stretch` replacing `xl:items-start`,
plus `xl:mt-6`). Console and hydration warnings: none.

### 12b. Settings — the design's master/detail at xl

The design's Settings frame is `grid-template-columns: 440px minmax(0,1fr)` with
the grouped list on the left and the selected row's page on the right. The app
ships exactly that by reusing `SplitView` (§4) and the existing section screens.

| Design | App | Classes |
|---|---|---|
| master column 440 | `SplitView` list pane | `xl:grid-cols-[440px_minmax(0,1fr)]`, pane `xl:pl-6 xl:pr-5 xl:pt-6 xl:border-r xl:border-outline-variant/35` |
| "Settings" title 24 on a 40px line | `SettingsTitle` in the list pane | unchanged (already the laptop row) |
| group label 12, `.12em` | `SettingsGroup` | unchanged (`xl:text-xs xl:tracking-[.12em]`) |
| row 48, pad 14, 32 tile | `SettingsRow` | unchanged (`xl:h-12`); selected row adds `xl:bg-sent-container` (`#f3e9c8`, the design's `rowBizBg`) |
| pane content | the section's existing screen | `SplitView` detail (max 720), keyed by the section |
| nothing selected | icon-only placeholder | no new copy — the design's frames always show a section, so there is no empty-detail copy to reuse (same call the Invoices split made) |

How the panes are wired (§ the Invoices split's rules, from `fix/split-detail-sync`
— which is not on `main`, so the pattern was ported rather than merged):

- At xl, `/settings/<section>` is the **Settings tab**, not a nested route
  (`AppShell`, `sectionFromPath`), so the deck — and the list pane inside it —
  stays mounted. One `SettingsView` renders both panes; the section comes from the
  pathname.
- The row click sets the selection and then **pushes** `/settings/<section>`, so
  the pane follows the tap instead of the navigation payload, and Back/Forward
  step through the sections you opened. No Back button is rendered over the split
  (`parentRoute` is null for the Settings tab at xl).
- The detail pane is keyed by the section, so a selection change hands it a fresh
  instance (the Invoice style card seeds state from the profile).
- A payout method (`/settings/payouts/<method>`) is its own screen at every width:
  the split only covers the Settings screen and its **one-level** section routes.

What opens in the pane, and what does not (audit, section by section):

| Row | Target | In the pane? |
|---|---|---|
| Business profile | `/settings/business` | yes |
| Payment options | `/settings/payouts` | yes |
| Plan | `/settings/plan` | yes |
| Notifications | `/settings/notifications` | yes |
| Help & feedback | `/settings/help` | yes |
| Manage login | `/settings/login` | yes |
| Clients, Products & Services | the Clients tab | no — another tab, unchanged |
| Records | `/vault` | no — its own route, unchanged |
| Recurring expenses | `/dashboard/recurring` | no — the Books tab, unchanged |
| Invite a contractor | sheet (no route) | no — the invite sheet, unchanged |

The pane's own actions are untouched: Payment options lists its six method rows
(`stripe`, `bank`, `zelle`, `cashapp`, `paypal`, `venmo`) and each opens its own
page (with its Back button) at every width, the same as on `main`.

Verified on the preview (1440×900, 1920×1080, 1279×800, 390×844): all six sections
clicked in sequence and back to the first — correct path, correct pane title,
correct row highlighted, the list's marker and `scrollTop` preserved on every
click (no remount), never a Back button over the split, console and hydration
clean. `/settings/notifications` deep-linked and hard-reloaded renders the split
with the row selected. History: list → Plan → Notifications → Back → Plan →
Forward → Notifications → Back → `/settings`. 1440 → 1000 → 1440 keeps the
selection and returns to the split; at 1000 the full page renders with its Back
button, byte-identical to `main`. The list scrolls when it must (at 1440×560 the
pane is 560 with 828 of content, `scrollTop` 268 kept across a click).

Below 1280: `/settings` and `/settings/plan` at 1279×800 and 390×844 — the
stripped-`xl:` innerHTML hash (`673ad1ac` / `f4b8aa0b`) and the geometry hash
(`7fb3f743` / `c504b4f`) are identical to the pre-change build; the Settings
markup itself adds no `xl:` token below 1280 (the selected-row token is only
emitted while a row is selected, which only the split does).

**Cost of the client-resolved width:** a direct load of `/settings/<section>` at
xl paints the nested route's own page for one frame before the shell swaps to the
deck — the same trade the Invoices split made, and the reason no width is read on
the server.
