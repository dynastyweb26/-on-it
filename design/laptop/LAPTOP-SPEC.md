# LAPTOP-SPEC — round 1 (laptop only, viewport ≥ 1280)

Source of truth for the laptop UI round. Values below are read out of
`design/laptop/tutorial.html` (the owner's Claude Design export), not invented.
Where this file and `IMPLEMENTATION.md` disagree, this file wins (it is the one
measured from the design); where either disagrees with `SECURITY.md` or section 0
of `IMPLEMENTATION.md`, those win.

## 0. Provenance

| What | Value |
|---|---|
| Design file | `design/laptop/tutorial.html` (2 588 234 bytes, sha256 `6c3572917f9357290f6d927bcb6ba3bbd8820717cf072c9495b8e35cba70403c`) |
| Original export | `On It Laptop Tutorials (standalone).html`, repo root of the founder's checkout |
| Canvas viewports | `1440x900` (default) and `1280x800` (Tweaks prop `viewport`) |
| Reduced-motion prop | `reducedMotion` (default `false`) |
| Autoplay prop | `autoplay` (default `true`) — a fresh load starts the Chat tour |
| Sidebar | 288px, always present in the frame (laptop has the full sidebar) |
| Content area | frame width − 288 |

The export is a bundled page: the design markup and its script are inside
`<script type="__bundler/template">`. Extract it for reading with:

```bash
node -e 'const s=require("fs").readFileSync("design/laptop/tutorial.html","utf8");
const m=s.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
require("fs").writeFileSync("/tmp/template.html", JSON.parse(m[1]))'
```

Round scope: **laptop only**. Every rule applies behind Tailwind `xl:` (≥1280).
Below 1280 the app must render exactly as `feat/laptop-ui` did at `2c3be11`.

### Missing design files (open blockers)

- **Paywall laptop HTML** — not in the export, not in the repo, not in
  `design-reference/` (that is the older 448px phone card). Commit 12 is blocked
  until the owner supplies it. No paywall values are quoted in this file.
- Screenshots of the redrawn laptop screens — none supplied; the live HTML is
  the reference, at 1440×900 and 1280×800.

## 1. Frame and shell

Frame: 288px sidebar (`padding:28px 20px 20px`, `background:#fbf3e5`,
`border-right:1px solid #efe4d2`, `gap:28px`, `z-index:6`) beside a content pane
(`left:288px; right:0; top:0; bottom:0; overflow:hidden`). The rounded browser
chrome around the frame in the export is the screenshot, not the UI.

**Sidebar** (`AppShell.tsx` aside at `xl:`)

| Element | Design values |
|---|---|
| Logo row | `display:flex; justify-content:space-between; padding:0 6px` |
| Wordmark | Montserrat 800, 26px/1, `letter-spacing:-.01em`; dot `#735c00` |
| "How it works" pill | height 36, `padding:0 14px`, radius 999, `background:#d4af37`, gap 4, Inter 600 13.5px/1 `#1f1b13`, `expand_more` 18px, `aria-haspopup="menu"`, `aria-expanded`; hover `filter:brightness(1.04)`; focus `outline:2px solid #1f1b13`, offset 2 |
| Nav | column, gap 4, radius 18 |
| Nav row | height 48, gap 14, `padding:0 16px`, radius 16, Inter 16px; active `background:#d4af37`, weight 700, icon FILL 1; rest weight 500, transparent; hover `#f5eddf`; focus gold ring 2px/offset 2 |
| Install card | `margin-top:auto`, padding 14, radius 20, `#fff`, `1px solid #efe4d2`, row gap 12; tile 36×36 radius 10 `#f0e3b8` (icon 20); text Inter 500 13px/1.35 `#4d4635`, `flex:1; min-width:0`; Install button height 32, `padding:0 12px`, radius 999, `#d4af37`, Inter 600 13px, `white-space:nowrap` |

**Tour picker** (menu under the pill): `left:20px; top:76px; width:300px`,
padding 8, radius 20, `#fff`, `1px solid #efe4d2`,
`box-shadow:0 24px 50px -18px rgba(115,92,0,.35)`, gap 2, `animation:menuIn .25s
cubic-bezier(.2,.8,.2,1) both`. Items: `height:52px; padding:0 10px; radius:14px;
gap:12px`; tile 34×34 radius 10 `#f0e3b8` icon 19; name Inter 700 15px/1.2, meta
Inter 400 12.5px/1.3 `#4d4635`; current tab chip `height:22px; padding:0 8px;
radius:7px; background:#f3e9c8; Inter 700 10.5px/1; letter-spacing:.08em;
color:#735c00`. Selected row `#fbf3e5`; focus `outline:2px solid #d4af37;
outline-offset:-2px`.

## 2. Screens

All titles are Montserrat 700 24px/1 inside a 40px row. Content panes use
`padding-top:24px` and `gap:20px` between blocks unless stated.

### Chat

- Column: `width:100%; max-width:720px; padding:0 24px; box-sizing:content-box`,
  centered. Composer shares exactly those edges.
- Header: height 72, `justify-content:space-between`,
  `border-bottom:1px solid #f0e7d8`; title 24 Montserrat 700; actions gap 4, tiles
  40×40 radius 12, icon 24 `#4d4635`.
- Messages: `flex:1; min-height:0; overflow:hidden;` column, content gap 14,
  padding `20px 0`; day label 600 12px/1, `letter-spacing:.12em`, `#7f7663`.
- Composer row: height 80, `border-top:1px solid #f0e7d8`, gap 10. Plus 44 circle
  `#f0e3b8`; field `flex:1; height:44px; radius:22px; #fff;
  border:1.5px solid #d0c5af; padding:0 4px 0 16px`; camera 36 circle
  `#f0e3b8`; send 44 circle (`#efe7da`/`#7f7663` idle, ink/cream when ready).

### Invoices — split view

- `display:grid; grid-template-columns:<master>px minmax(0,1fr)`; master is
  **440 at 1440**, **392 at 1280**. Turns on at `xl:` only (see section 5).
- Left pane: `border-right:1px solid #efe4d2; padding:24px 20px 0 24px; gap:14`.
- Segment toggle: height 44, radius 22, `#f5eddf`, 2 equal columns; pill
  `top:4px; bottom:4px; left:4px/50%; width:calc(50% - 4px); radius:18px;
  background:#d4af37; transition:left .5s cubic-bezier(.65,0,.35,1)`; labels
  Inter 600 15.
- Filter chips: active `height:36; radius:10; border:2px solid #d4af37;
  background:#f3e9c8`; rest `border:1.5px solid #d0c5af; background:#fff`;
  count pill `min-width:24px; height:22px; radius:11px` (white / `#f5eddf`).
  Right cluster: Inter 400 13px `#4d4635`, two lines, `tabular-nums`
  ("3 open · $1,200.00" over `schedule` 15px + "Newest first").
- Month divider: `padding:6px 10px; radius:8; background:#f3e9c8`;
  Montserrat 800 12px/1, `letter-spacing:.1em`, `#554300`.
- Invoice card: `grid-template-columns:minmax(0,1fr) auto; gap:4px 12px;
  padding:12px 14px; radius:20; background:#fbf3e5; border:1.5px solid #efe4d2`.
  Client Montserrat 700 17px/1.2; meta Inter 400 13.5 `#4d4635`; amount Montserrat
  800 20px; hover `#efe7da`. Selected: `background:#f3e9c8;
  border-color:#d4af37`. Due badge `height:24; padding:0 8px; radius:7;
  background:#f3e9c8; Inter 700 11px; letter-spacing:.07em; color:#735c00`.
- Right pane: `padding:24px 40px`, centered, detail `max-width:720`.
  - Top bar 40px: status chip `28px/radius 8/Inter 700 12px/letter-spacing:.1em`;
    mono number Inter 600 13px `'IBM Plex Mono'` `#4d4635`; Record payment button
    `margin-left:auto; height:40px; radius:999; background:#d4af37;
    padding:0 6px 0 14px; gap:8; font:700 15px` + amount chip `height:28;
    padding:0 10px; radius:999; background:#fbf3e5; font:700 13px Montserrat`.
  - Summary card: `padding:22px 24px; radius:20; background:#fbf3e5;
    border:1.5px solid #efe4d2; grid 1fr auto; gap:16px 24px; align-items:end`.
    Client 800 30px/1.1; sub 400 15 `#4d4635`; "Amount due" 600 14; figure 800
    40px `#735c00`; due strip `grid-column:1/-1; height:44; padding:0 14px;
    radius:12; background:#fff; border:1px solid #efe4d2`; actions
    `grid-column:1/-1; 4 columns; gap:8` with 40px/radius 12 white cells.
  - Line items card: `padding:20px 24px; radius:20; #fbf3e5; border:1.5px
    #efe4d2; gap:12`; label Inter 600 13 `letter-spacing:.08em`; item row white,
    radius 14, `padding:12px 16px`.
- Estimate detail: `max-width:760; grid 1fr 260; gap:16`. Signature card 260 wide.
- Empty detail: the design has **no** empty-detail copy — the export's own note
  says `invoices-empty` does not show in this sample data. Per IMPLEMENTATION
  5.2 render an icon-only placeholder and report it.

### Clients

- Container `max-width:896`, `padding:24px 32px 0`, gap 20.
- Header row height 40, gap 16: title; pill tabs `width:340; height:40;
  radius:20; background:#f5eddf; columns 1fr 1.5fr`, pill radius 16 `#d4af37`,
  labels Inter 600 14; then `margin-left:auto` cluster: search `width:300;
  height:40; radius:20; background:#fff; border:1.5px solid #d0c5af; padding:0
  14px; gap:8; Inter 400 15`; add button 40×40 radius 20 `#d4af37`, icon 24.
- List: `grid-template-columns:minmax(0,1fr) 22px; gap:12`.
  Card `radius:20; background:#fff; border:1px solid #efe4d2; overflow:hidden`.
  Letter header `grid 48px minmax(0,1fr) 200px 24px; gap:14; padding:10px 18px;
  background:#fbf3e5; Inter 700 11.5px; letter-spacing:.1em; color:#735c00`.
  Row `grid 44px minmax(0,1fr) auto 24px; gap:14; align-items:center;
  padding:10px 18px; border-top:1px solid #f0e7d8; radius:14`; hover
  `background:#fbf3e5`. Avatar 40 circle `#f0e3b8` `#554300` 700 16; name Inter
  700 16; meta Inter 400 14.5 `#4d4635`; chevron 20.
- A–Z rail: column, `Inter 700 10.5px/14px`, `#7f7663`, radius 11, `padding:4px 0`,
  current letter `#735c00`.

### Books

- Container `max-width:1088`, `padding:24px 32px 0`, gap 20.
- Header 40px: title, then `margin-right:auto`? (title takes it) and two pills:
  "Income & Expenses" `height:40; padding:0 16px; radius:999;
  background:#f5eddf; border:1.5px solid #d0c5af; Inter 600 15; gap:8; icon 20`;
  "Add expense" `height:40; padding:0 18px; radius:999; background:#d4af37;
  Inter 700 15; gap:8; icon 22`.
- Row 1: `grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:16`.
  Net card `padding:26px 28px; radius:20; background:#343027; color:#fff8f0;
  min-height:180; flex column; justify-content:flex-end`; label 600 13
  `letter-spacing:.05em` `#e9c349`; figure Montserrat 800 48px `#e9c349` with
  decimals at 26px; sub 400 14 `#d0c5af`; chevron absolute `right:22; top:22`,
  24px `#d0c5af`.
  Right: `grid 1fr 1fr; grid-template-rows:1fr auto; gap:12`. Still owed tile
  `padding:16px 18px; radius:20; #fff; border:1.5px solid #f3e9c8`; Collected
  same but `#efe4d2`; label 600 14 + 8px dot (`#d4af37` / `#0f6d31`); chevron 18
  `#7f7663; margin-left:auto`; figure 800 28 with decimals 16 `#4d4635`.
  Spent `grid-column:1/-1; height:52; padding:0 18px; radius:20; #fff;
  border:1.5px solid #efe4d2`; label 600 15; figure 800 20 (decimals 13).
- Row 2: `grid-template-columns:minmax(0,1.6fr) minmax(0,1fr); gap:16;
  align-items:start`.
  List card white, radius 20, `1.5px #efe4d2`; rows `height:64; padding:0 18px`
  (first `border-bottom:1px solid #f0e7d8`); tile 40 radius 12 (`#f5eddf` /
  `#f0e3b8`); title 600 16; sub 13.5 `#4d4635`; chevron 20.
  Recaps card `padding:18; radius:20; #fff; border:1.5px solid #efe4d2; gap:14`;
  header icon `auto_awesome` 24 `#735c00` (twinkles 3× on demand), label 600 17,
  chevron; "Watch again" pill `height:36; padding:0 14px 0 10px; radius:999;
  background:#f5eddf; Inter 600 14; gap:4`, `play_arrow` FILL 1 at 22px.

### Settings and inner pages

- Split: same `<master>px minmax(0,1fr)` grid as Invoices. Left pane rows:
  group label `margin:18px 0 8px 4px; Montserrat 700 12px; letter-spacing:.12em;
  color:#4d4635`; card `radius:18; #fff; border:1px solid #efe4d2; overflow:hidden`;
  row `height:48; padding:0 14px; gap:12; border-bottom:1px solid #f0e7d8`;
  tile 32×32 radius 9 (`#f0e3b8` for Clients/Products, else `#f5eddf`), icon 18;
  label Inter 400 15.5; value Inter 400 14 `#4d4635`; chevron 18.
  Selected pane row: `background:#f3e9c8`.
- Right pane: `padding:24px 40px`, centered; content `max-width:640` (Payment
  options, Business Info, Notifications) or `max-width:680` (Brand Design);
  title 40px row 24 Montserrat; intro 400 15/1.45 `#4d4635`;
  `animation:slideIn .4s cubic-bezier(.2,.8,.2,1) both`.
- Payment options: section labels as above; rows `height:52; padding:0 14px;
  radius:18; #fff; border:1px solid #efe4d2`, tile 32 radius 9 `#f5eddf`,
  label 15.5, value 14 `#4d4635`, chevron 18. Payment apps grid `1fr 1fr` inside
  one bordered card, dividers `#f0e7d8`. Staggered entry: cards 0.10s / 0.18s /
  0.26s (`cardIn .45s` with default easing — no cubic-bezier in the export).
- Business Info: card `padding:20; radius:20; #fbf3e5; border:1.5px solid
  #efe4d2; grid 1fr 1fr; gap:10`; inputs `height:48; radius:12;
  background:#f5eddf; border:1px solid rgba(212,175,55,.2); padding:0 14px;
  Inter 400 16`; terms textarea `height:96; padding:12px 14px`; counter 13 right.
- Brand Design: cards `padding:18px 20px; radius:20; #fbf3e5; border:1.5px solid
  #efe4d2`; template tiles 4 columns `padding:10px 12px; radius:14;
  border:2px` (selected `#f3e9c8`/`#d4af37`, else `#fff`/`#efe4d2`,
  `transition:all .35s`); color swatches `height:28; radius:8` in 3 columns.
- Notifications: card `radius:18; #fff; border:1px solid #efe4d2`; row `height:60;
  padding:0 16px; border-bottom:1px solid #f0e7d8`; toggle `48×28; radius:14`
  (`#d4af37` on, `#d0c5af` off) with 22px knob at `left:3px`/`23px`,
  `transition:left .3s cubic-bezier(.3,1.4,.5,1)`, track `.3s`.

### Sheets

Dialog `width:512px; padding:24px; radius:20; background:#fff8f0; gap:14;
box-shadow:0 30px 70px -20px rgba(52,48,39,.45); animation:dlgIn .4s
cubic-bezier(.2,.8,.2,1) both`, scrim `rgba(31,27,19,.38)` fading in `.3s`.
Refresh the existing 15 md+ dialogs against this only if they differ.

## 3. Tutorials (the laptop design)

Five tours, 21 scenes. `data.ts` already holds the same scene list, copy,
targets and step timings — the export is the reference for values, `data.ts`
stays the app's source. Scene titles/subs/targets are already identical; do not
rewrite copy.

| Tour | Scenes | Names | End card |
|---|---|---|---|
| Chat | 6 | Type it out · Estimates too · Snap a receipt · Prefer a form? · Ready to share · Start fresh, find old chats | "Now just type it." |
| Invoices | 4 | Everything you sent · Open or paid · Tap to open · Signed? Convert it. | "All your paperwork, sorted." |
| Clients | 3 | Your people, A to Z · See what's out · Save your jobs | "Your people, sorted." |
| Books | 4 | Know where you stand · Log it fast · Your recaps · Recurring expenses | "Your money, clear." |
| Settings | 4 | Get paid your way · Your business info · Make it yours · Turn on alerts | "Set up and ready." |

**Overlay mechanics (verbatim)**

- Spotlight: target rect padded 6px; `box-shadow:0 0 0 3000px rgba(31,27,19,.6)`;
  ring `border:2px solid #e9c349; box-shadow:0 0 18px rgba(233,195,73,.55);
  animation:ringPulse 1.6s ease-out infinite`.
  Transition `left/top/width/height .55s cubic-bezier(.2,.8,.2,1),
  border-radius .55s, opacity .4s`.
- Callout: width 360, gap 18 to the spotlight, 16px frame margin, padding
  `16px 18px`, radius 20, `#1f1b13`, arrow 14×14 rotated 45°, `hlIn .5s
  cubic-bezier(.2,.8,.2,1) both`, position transition `.5s` (left/top).
  Placement: targets left of 55% try right then left; wider than 45% of the
  frame try below then above; else bottom-right dock. Cross-axis centred and
  clamped so it never leaves the frame.
- Eyebrow `Inter 700 11.5px; letter-spacing:.14em; color:#e9c349`; title
  Montserrat 800 24px/1.12 `letter-spacing:-.015em`; sub Inter 500 15px/1.4
  `#efe7da`; progress dots 6px (current 26px) with gold fill track; Skip
  `h:36; padding:0 12; radius:999; background:rgba(255,248,240,.1)`, Back 36px
  outlined circle, Next `h:36; padding:0 18; radius:999; background:#d4af37;
  Montserrat 800 14.5px; opacity .55 until the scene is ready`.
- Two alternating callouts (`hlA`/`hlB`, one per scene parity) and two veils per
  scene (`veil .5s ease-out`), so each scene cross-fades.
- Tap simulation: two ripples `ripple .9s ease-out` at .15s/.35s and a press
  disc `press .6s ease-out`.
- Scene durations come from `anim(sc)`: last step time + 0.5s, minimum 1.5s,
  plus 0.9s after a tap, 0.7s after a spotlight, 1.2s after a subtitle.
- Progress: `nextLabel` is "Got it" on the last scene; the end card is 420px
  wide, `pop .5s cubic-bezier(.2,.8,.2,1) both`, 60px gold disc with `check`
  (`pop .5s .15s both`), eyebrow `TOUR · DONE`, title, "Replay anytime with How
  On It works.", "Got it" button `height:44; radius:999; background:#343027`.
- Keyboard: **→ or Enter = Next, ← = Back, Esc = Skip**; focus moves to Next on
  each scene, Esc/Enter closes the end card. Picker: ↑ ↓ move, Enter plays,
  Esc closes and returns focus to the pill.
- Reduced motion: each scene jumps to its end state, spotlight and callout snap
  (`transition:none`), **no** ring pulse, **no** tap ripples, **no** veil sweep,
  no particle motion.
- Picker: opening it is the only way to pick a tour on laptop; it opens under
  the sidebar pill (not a full-screen sheet).

**Target map** (design name → real app selector; add `data-coach` only where the
element exists and has none, never rename an existing one):

`sideNav → [data-coach="side-nav"]`, `howBtn → aside button[aria-haspopup="menu"]`,
`composer → [data-coach="chat-composer"]`, `chat-messages → [data-coach="chat-messages"]`,
`camera → [data-coach="chat-camera"]`, `invCard/dueBadge/recordPay/actions` (invoice
card + detail elements in ChatMock/InvoicesMock), `statusTabs → [data-coach="invoices-filter"]`,
`invList → [data-coach="invoices-list"]`, `scrubber → [data-coach="clients-list"]` rail,
`search → clients search input`, `addPS → [data-coach="clients-add"]`,
`net → [data-coach="books-net"]`, `owed/coll/spent → [data-coach="books-stats"]`,
`addExpense → [data-coach="books-add-expense"]`, `viewExpenses/recurring/recaps →
Books list card rows`, `paymentRow → [data-coach="settings-payouts"]`,
`rowBiz → [data-coach="settings-profile"]`, `settings-replay → [data-coach="settings-replay"]`.
Unmapped in this round (no live element in the export's sample data):
`invoices-empty`, `clients-empty-add` — they only exist in empty states, which the
design does not render; they stay in `coach-marks.ts` unchanged.

## 4. Motion catalogue (copy verbatim; scoped to the laptop layer)

```css
@keyframes scrIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes slideIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
@keyframes cardIn{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
@keyframes pop{0%{opacity:0;transform:scale(.86)}60%{opacity:1;transform:scale(1.04)}100%{opacity:1;transform:scale(1)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes ringPulse{0%{box-shadow:0 0 0 0 rgba(233,195,73,.6)}100%{box-shadow:0 0 0 16px rgba(233,195,73,0)}}
@keyframes ripple{from{transform:scale(.4);opacity:.9}to{transform:scale(2.6);opacity:0}}
@keyframes press{0%{transform:scale(1.3);opacity:0}30%{transform:scale(1);opacity:1}55%{transform:scale(.8)}100%{transform:scale(1);opacity:1}}
@keyframes flash{from{opacity:.95}to{opacity:0}}
@keyframes scan{from{top:0}to{top:100%}}
@keyframes hlIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes veil{from{opacity:.92}to{opacity:0}}
@keyframes menuIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
@keyframes dlgIn{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
@keyframes glow{0%{box-shadow:0 0 0 0 rgba(212,175,55,.85)}100%{box-shadow:0 0 0 12px rgba(212,175,55,0)}}
@keyframes twinkle{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.3) rotate(14deg)}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}
```

Deltas against `src/components/tutorial/tutorial.module.css` (the phone
prototype, which must not change): `scrIn` travel 8px (app 10px) and duration
.4s (app .45s); `slideIn` travel 24px (app 44px) and .4s (app .45s); `hlIn`
travel 10px (app 14px); `menuIn` travel 8px (app 16px), `scale(.97)` (app .96),
duration .3s (app .4s); `ringPulse` gold `#e9c349` (app `#e6c65a`). Laptop
scenes/tours get the design values behind the laptop layer; phone keeps the
current ones.

Also present in the export but only used by the harness, not the app: none.

## 5. Gate and verification

- Split view turns on at `xl:` (1280) in this round. The export's `masterCol` is
  440 at 1440 and 392 at 1280 — so the pane is a function of the frame width,
  implemented with a viewport breakpoint plus an `xl:` width.
- Diff gate: `node scripts/design-diff.mjs --config design/laptop/diff.config.json
  --preview <url> --only <cases>`, then once with `--reduced`. Preview only; never
  localhost. Needs `--bypass-token` (Vercel protection) and/or
  `--storage-state` (signed-in test seller).
- Widths: 1440×900 and 1280×800 are the design cases; 390, 768, 1032, 1180 are
  regression checks and must be pixel-identical to `feat/laptop-ui@2c3be11`.
- "Titles start at the same x": all pages use `PageContainer` (1152/1024/896) and
  the same `px-4 md:px-8` — at xl the content column starts at the same x
  everywhere, and screen titles sit on a 40px row.

## 6. Stop conditions (from IMPLEMENTATION.md §10)

Design needs data/copy/route/component that does not exist; a layout would change
phone rendering; Invoices integration needs `TabDeck`/`swipe.ts` behaviour
changes; a tutorial target cannot be mapped; `npm test` fails outside the change;
anything touching auth, payments, DB or security. The missing paywall design HTML
is the first such stop.
