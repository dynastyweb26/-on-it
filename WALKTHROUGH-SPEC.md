# WALKTHROUGH-SPEC — Coach-mark walkthrough, one per tab

**Status:** spec, not built. Written 2026-10-09 from a crawl of `main` at merge `fix/pay-display-batch-b`.
**Owner:** Deffeu. **Design:** Claude Design (overlay system only, §6). **Build:** coding agent (§7–§9).
**Source of the idea:** Notion › On It — Product Decisions › "Rework the tutorial into an animated walkthrough system" (Oct 9 2026).

---

## 0. What this is, in one paragraph

A guided tour that runs **on the real app**. The screen dims, a spotlight opens around one control, and a tooltip says what it does. The user taps **Next**, or taps the control itself when a step asks them to try it. There is one walkthrough per tab: **Clients → Invoices → Chat → Books → Settings**. Each one ends on a card that says **"Continue to the Invoices walkthrough →"** (and so on), so the five can be played as one tour or one at a time. While the tour runs, the app shows **invented sample data** from a sandbox that cannot write anything. Leaving the tour puts the user's real data back exactly as it was.

---

## 1. Decisions locked (from Deffeu, 2026-10-09)

1. **Coach marks on the real UI**, not a recreated animation. It stays accurate as the UI changes, because steps anchor to real controls.
2. **Invented data** during the tour, so a brand-new account still has something on every screen.
3. **Five walkthroughs**, one per tab, chained by a "Continue to …" card. Each one can also be played alone.
4. **Claude Design** designs the overlay: spotlight, tooltip, progress, continue card, and motion. It does not redraw app screens.

## 2. Decisions to confirm (defaults in bold, change before build)

| # | Question | Default |
|---|---|---|
| D1 | What happens to the current first-run slide carousel (`FirstRunTutorial`, 10 slides)? | **Replace it.** On first run, show a one-card prompt: "Take the 3-minute tour" / "Skip for now". Settings › "Replay the walkthrough" opens the tour picker (§5.6). |
| D2 | Keep the "How On It works" pill and reference doc? | **Keep.** It's the read-it-yourself version. The tour is the show-me version. |
| D3 | Tour order when played as one | **Chat first**, then Invoices, Books, Clients, Settings. Chat is where the money starts, and the demo invoice made there shows up on the next tabs. Tab order (Clients first) stays available from the picker. |
| D4 | Does the sample business sit in the user's trade? | **One fixed sample business** for v1 ("Ridgeline Home Services", §4). Per-trade samples are a later nicety. |
| D5 | Paid-only features (Recurring, Recaps) | **Show them**, with a "Pro" tag in the tooltip. A free user should know what the trial unlocks. |

---

## 3. Feature inventory — every tappable thing, by tab

This is the crawl. Each tab's step list (§5) is drawn from this. **Bold** = covered by a tour step. *Italic* = mentioned inside another step's tooltip, not its own stop. Plain = not in the tour, listed so nothing is forgotten.

### 3.1 App-wide
- **Bottom nav, 5 tabs**, with Chat as the raised centre pill (`app/(app)/layout.tsx` `TABS`).
- *Swipe left/right between tabs* (index-based, no wrap).
- Chat-only header: **New chat** (pencil), **Recent conversations** (clock), **"How On It works"** pill.
- Install banner (PWA). Splash. Not in tour.

### 3.2 Clients — `/clients` (`components/clients/*`, `components/lists/SavedList.tsx`)
- **Segmented control: Clients · Products & Services** (gold thumb slides).
- **Search bar** with count ("Search 6 clients") and **＋ add button**.
- **Client row**: name + status line. The status line reads one of: *"2 overdue · $1,840.00"* (red), *"1 open · $650.00"*, *"1 quote out"*, *"Paid up"*, or *"No invoices yet"*.
- *A–Z letter sections* and the **letter index strip** (drag to jump).
- **Long-press a row** → menu: Edit · Delete (Products also have Duplicate).
- *Swipe a row* → Edit / Delete.
- Empty states: "No clients yet" and "Nothing saved yet" with an add button. Not shown in the tour (demo data fills the lists).
- **Client detail** `/clients/[id]`: **Call · Text · Email · Invoice** action row (Invoice is gold). **Total paid / Still owed** figures. **Info rows**: phone, email, address, notes (empty ones read "Add phone" and similar, and tap to edit). **Invoices & quotes** list. **Edit** (top right).
- **Client form**: Name, phone, email, address, and notes ("Gate code, preferred contact time…"). Save turns into a ✓.
- **Product form**: Name ("Deck staining"), **price**, **unit picker** (4 options), and a detail line.
- *On It offers to save anyone you bill twice* (`SavePromptCard`, shown in Chat).

### 3.3 Invoices — `/invoices` (`app/(app)/invoices/page.tsx`, `[id]/page.tsx`, `lib/doc-tags.ts`)
- **Filter chips: All · Unpaid · Paid · Quotes** (the Unpaid filter shows a summary like "4 unpaid · $4,790.00" above the list).
- **Sort caption**: Newest first ↔ A–Z by client.
- **Month dividers.**
- **Invoice row**: client, number + date, big amount (part-paid shows the balance plus "due of $X"), **status tag**. Tags: DRAFT · SENT · DUE OCT 24 · VIEWED (eye icon) · OVERDUE · PAID · CONVERTED.
- *Swipe a row → Delete.*
- **Invoice detail** `/invoices/[id]`:
  - Header: client, number, status, "Viewed Oct 3", **due-now amount** (rolls on payment), and total.
  - Action chips:
    - **Record payment** (Deposit paid / Paid in full / Other amount…, then method Zelle/Cash/Check/Card/Other, then date)
    - **Share PDF**
    - **Copy pay link** (sent invoices)
    - **Request balance** (part-paid)
    - **Download** / **Download draft**
    - **View PDF**
    - **Convert to Invoice** (quotes)
    - **Converted to INV-…** / **Original quote** links
    - **Delete**
  - **Payment history** with per-payment delete.
  - Draft only: **Line items editor** ("Tap a value to edit"), **Deposit required** (None / % / $), **Notes**.
  - *PAID stamp animation* when the balance hits zero.

### 3.4 Chat — `/chat` (`app/(app)/chat/page.tsx`, `ComposerMenu`, `LineItemsEditor`, `template/*`)
- Header (see 3.1): **New chat**, **Recent conversations** list, **How On It works**.
- **Composer**:
  - **Gold ＋** opens a menu: **Voice** ("Say it, On It writes it"), **New invoice**, **New quote** ("Guided template").
  - **Message field** ("Message On It…").
  - **Gallery** (upload a receipt).
  - **Camera** (take a receipt photo).
  - **Send**.
- **Voice session**: the ＋ becomes the mic. Rings while listening. Stop and send, or End.
- **Draft card** (after you describe a job):
  - "Invoice for …"
  - **Line items**: tap description / qty / unit / price to edit. **Up · Down · + Description · Dup · Delete**. **Add line item**.
  - **Deposit required** (None / % / $).
  - **Notes**.
  - Totals: Subtotal, Tax, Project total, deposit, Remaining balance, **DEPOSIT DUE NOW**.
  - *"Similar invoice sent recently"* hint.
  - **"Looks right — send it"** (then Share invoice).
  - **Download draft** with an **(i)** ("Drafts don't hold a live pay page.").
  - **Undo last edit** and **Change something**.
- **Locked card** after send: "This invoice was sent, so it's locked." plus **Revise** (unpaid only). Revise opens a copy noted "Replaces INV-…".
- **Guided template** (＋ › New invoice/quote): Close, **Client** picker, **Items** (picker, − / qty / +, price keypad, remove), **Extra info** (dates, notes, deposit), **Total**, **Send ↗**. Invoice ↔ Quote switch.
- **Receipt flow**: photo bubble → "Reading your receipt…" → **LOGGED expense card**.
- **Save prompts** (`SavePromptCard`): save this client / save this product / make it recurring.
- Free-tier quiet usage line, paywall modal, failed message plus **Retry**. Not tour stops.

### 3.5 Books — `/dashboard` and sub-screens
- **Recaps card** (Pro): states are *Coming soon*, *Unlock*, *First one lands Monday*, and *latest recap* (tap to play) plus › **All recaps**.
- **Net · all time** (dark hero) → Books summary.
- **Three tiles**: **Collected** → income, **Still owed** → Unpaid invoices, **Spent** → Expenses.
- **Add expense** → sheet: **$ Amount**, **category chips**, **note**, **Save**.
- **View expenses** → `/expenses`: **＋**, **search** ("Search vendor or category"), **Week / Month** switch, **receipt thumbnail** → full-screen lightbox.
- **Recurring** row (Pro) → `/dashboard/recurring`: ＋, empty state, **Next 2 weeks**, **All recurring**, long-press → Edit · Stop & delete.
- **Books summary** `/summary`:
  - **Period picker** sheet (All time, by year/month).
  - **Expenses PDF** and **Income PDF** export buttons.
  - Brought in / Spent hero.
  - **Expenses by category** and **Income by client** (expandable).

### 3.6 Settings — `/settings` and sections
- **Your business**: Clients (count) · Products & Services (count) · **Business profile** · **Records → Vault**.
- **Money**: **Recurring expenses** ("In Books") · **Payouts**.
- **Account**: **Plan** · **Notifications** · *Invite a contractor* (only with a referral code) · **Help & feedback**.
- **Business profile**: business name, website, slogan, **Logo**, payment handles (**PayPal, Cash App, Venmo**: "Save PayPal, Cash App & Venmo"), **Zelle** (phone or email, stored encrypted), and **Invoice style** (template + colors).
- **Payouts**: **Stripe** "Accept cards & online payments". Connect / under review / finish setup states, plus an **Accept card payments** switch.
- **Plan**: plan and subscription. **Notifications**: payment alerts, unsent-draft reminder.
- **Help**: How On It works · **Replay the walkthrough** · Contact us · Terms · Privacy.
- **Sign out**, **Delete account** (typed DELETE). Not tour stops, and must be blocked in demo (§7.4).
- **Vault** `/vault`: every sent PDF, searchable.

---

## 4. The sample business (demo data)

One fixture file, `src/lib/walkthrough/demo-data.ts`. Invented names only. **No real clients**: not Cyril, Leonard, or anyone from production.

- **Profile:** "Ridgeline Home Services". Logo is a neutral monogram. Template is Classic. Handles are Cash App `$RidgelineHS`, Zelle `(555) 010-0144`, PayPal `ridgelinehs`. `access_tier: 'active'` (so Pro features render). Connect is shown as connected with card payments on.
- **Clients (6)**, chosen so every status line appears once:
  1. Alvarez Family: "2 overdue · $1,840.00"
  2. Brookside HOA: "1 open · $650.00"
  3. Chen Residence: "1 quote out"
  4. Dana Whitfield: "Paid up"
  5. Hollis Property Mgmt: "1 open · $2,300.00" (part-paid)
  6. Priya Nair: "No invoices yet"
- **Products & Services (8):** Deck staining ($3.25/sq ft), Faucet replacement ($185 each), Drywall patch ($90 each), Gutter cleaning ($140 job), Ceiling fan install ($160 each), Pressure washing ($0.40/sq ft), Service call ($75 each), and Hourly labor ($65/hour). Units are the app's real list (`lib/line-units.ts`): each · hour · sq ft · job.
- **Invoices & quotes (9)**, chosen so every status tag appears and the client lines above come out exactly:

  | Client | Document | Tag | Amounts |
  |---|---|---|---|
  | Alvarez Family | INV, due 20 days ago | OVERDUE | $1,200.00 |
  | Alvarez Family | INV, due 6 days ago | OVERDUE | $640.00 |
  | Brookside HOA | INV, sent, viewed, no due date | VIEWED | $650.00 |
  | Brookside HOA | INV, draft | DRAFT | $300.00 |
  | Hollis Property Mgmt | INV, due in 9 days, $1,200 fixed deposit paid by Zelle | DUE <date> | total $3,500.00 · paid $1,200.00 · balance $2,300.00 |
  | Chen Residence | Quote, sent | SENT | $4,200.00 |
  | Dana Whitfield | Quote, converted | CONVERTED | $1,150.00 |
  | Dana Whitfield | INV from that quote, paid | PAID | $1,150.00 |
  | Dana Whitfield | INV, paid | PAID | $480.00 |

  Dates are relative to today, so DUE and OVERDUE stay true whenever the tour is played. Derived numbers the tooltips quote: **Unpaid = 4 invoices · $4,790.00**. **Collected = $2,830.00** (1,150 + 480 + 1,200).
- **Expenses (12)** across at least 4 categories, 3 with receipt thumbnails (bundled images in `/public/walkthrough/`, not uploads).
- **Recurring (2):** Truck insurance $142/month, Phone $65/month, with one due inside "Next 2 weeks".
- **Recaps (1):** a recap for last week, if the recap story can render from fixture data. Otherwise the card shows the "First one lands Monday" state.
- **Chat:** a seeded conversation for the Chat tour (§5.3). The user's line is "Replaced the kitchen faucet and patched drywall for the Alvarez family, 185 for the faucet, 90 for the patch, 40 percent deposit". The assistant reply plus a draft card are already present. **No live AI call in demo** (§7.3).
- **Vault:** 3 archived sample PDFs, as bundled static files.

Totals must add up across screens (Books tiles = sum of fixture payments and expenses). Add a unit test that recomputes the tiles from the fixture and asserts the numbers the tooltips quote.

---

## 5. The walkthroughs, step by step

**Step types:**
- **SHOW**: spotlight plus tooltip, and the user taps **Next**. Taps outside the spotlight do nothing.
- **TRY**: the tooltip says "Tap it", and the user must tap the highlighted control. The real UI reacts on demo data, then the tour advances on its own. A small "Skip" link is always present, so nobody gets stuck.
- **GO**: the tour navigates to a sub-screen itself (no user action), then continues. Navigation uses the real router.

**Anchors:** every target gets a `data-tour="<id>"` attribute in code. The engine finds targets only by `data-tour`, never by CSS class or text, so restyling can't break the tour. The ids are listed per step.

**Copy rules:** max 2 short sentences per tooltip. Plain words, from the user's point of view ("you"). Numbers in copy must match the demo data.

### 5.1 Clients (9 steps)

| # | Type | Anchor `data-tour` | Tooltip |
|---|---|---|---|
| 1 | SHOW | `nav.clients` | **Clients** — everyone you work for, and everything you sell. |
| 2 | TRY | `clients.segment` | Two lists live here. Tap **Products & Services**. |
| 3 | SHOW | `products.row` (first row) | Save the jobs you do most, with a price. Picking one on an invoice fills the price in for you. |
| 4 | TRY | `clients.segment` | Back to **Clients**. |
| 5 | SHOW | `clients.row` (Alvarez) | Each client shows where they stand: what's overdue, what's open, or paid up. |
| 6 | SHOW | `clients.letterIndex` | Long list? Drag down the letters to jump. |
| 7 | SHOW | `clients.row` (Alvarez) | Press and hold any client to edit or delete them. You can also swipe the row. |
| 8 | GO → TRY | `client.actions` on `/clients/[alvarez]` | Call, text, or email them in one tap, or start an **Invoice** already addressed to them. |
| 9 | SHOW | `client.money` | What they've paid you, and what they still owe. Their invoices and quotes are listed below. |
| end | CARD | — | **Continue to the Invoices walkthrough →** · Done for now |

### 5.2 Invoices (10 steps)

| # | Type | Anchor | Tooltip |
|---|---|---|---|
| 1 | SHOW | `nav.invoices` | **Invoices** — every invoice and quote you've made. |
| 2 | TRY | `invoices.filter.unpaid` | Tap **Unpaid** to see who still owes you. |
| 3 | SHOW | `invoices.summary` | 4 unpaid, $4,790 in total. This is your chase list. |
| 4 | SHOW | `invoices.tag` (VIEWED row) | Tags tell you where each one is. **Viewed** means your client opened the pay page. |
| 5 | SHOW | `invoices.sort` | Newest first, or A–Z by client. Tap to switch. |
| 6 | GO → SHOW | `invoice.header` on the part-paid invoice | Open one and you see what's due now and what's already been paid. |
| 7 | TRY | `invoice.recordPayment` | Got paid in cash or Zelle? Tap **Record payment**. *(Demo: picking an option plays the paid animation on sample data and saves nothing.)* |
| 8 | SHOW | `invoice.payLink` | **Copy pay link** — text it to a client so they can pay by card, Apple Pay, or Google Pay. |
| 9 | SHOW | `invoice.share` | **Share PDF** sends it again from your phone. **Request balance** asks for the rest. |
| 10 | GO → SHOW | `invoice.convert` on the quote | Quotes become invoices in one tap once the client says yes. |
| end | CARD | — | **Continue to the Chat walkthrough →** |

### 5.3 Chat (11 steps)

| # | Type | Anchor | Tooltip |
|---|---|---|---|
| 1 | SHOW | `nav.chat` | **Chat** is where invoices get made. Just tell On It about the job. |
| 2 | SHOW | `chat.userMsg` (seeded) | Say it like you'd text a friend: who, what you did, and the price. |
| 3 | SHOW | `chat.card` | On It writes the invoice. Check it over before anything is sent. |
| 4 | TRY | `chat.lineItem.qty` (first line) | Anything wrong? Tap a number to fix it. |
| 5 | SHOW | `chat.lineItem.tools` | Move, duplicate, or delete lines, or add a description under one. |
| 6 | SHOW | `chat.deposit` | Need money up front? Set a deposit as a percent or a dollar amount. |
| 7 | SHOW | `chat.send` | **Looks right — send it** makes the PDF and opens your share sheet. *(Demo: does not send.)* |
| 8 | SHOW | `chat.downloadDraft` | Just want the file? **Download draft**. Drafts don't hold a live pay page until they're sent. |
| 9 | TRY | `chat.plus` | Tap **＋** for voice, or a guided invoice or quote. |
| 10 | SHOW | `chat.camera` | Snap a receipt and On It logs the expense for you. |
| 11 | SHOW | `chat.header.history` | Old conversations are here. The pencil starts a fresh one. |
| end | CARD | — | **Continue to the Books walkthrough →** |

### 5.4 Books (9 steps)

| # | Type | Anchor | Tooltip |
|---|---|---|---|
| 1 | SHOW | `nav.books` | **Books** — your money at a glance. |
| 2 | SHOW | `books.net` | What you've kept, all time: money in minus money out. Tap it for the full breakdown. |
| 3 | SHOW | `books.tiles` | Collected, still owed, and spent. Each one opens the list behind it. |
| 4 | TRY | `books.addExpense` | Bought materials? Tap **Add expense**. |
| 5 | SHOW | `expense.sheet` | Amount, category, done. *(Demo: Save closes the sheet without saving.)* |
| 6 | GO → SHOW | `expenses.list` on `/expenses` | Every expense, with receipt photos. Search it, or switch between week and month. |
| 7 | GO → SHOW | `books.recurring` (back on `/dashboard`) | **Pro** · Bills that repeat, like insurance or your phone, log themselves. |
| 8 | SHOW | `books.recaps` | **Pro** · Every Monday, your week as a one-minute story. |
| 9 | GO → SHOW | `summary.export` on `/summary` | Tax time: pick a period and export your expenses or income as a PDF. |
| end | CARD | — | **Continue to the Settings walkthrough →** |

### 5.5 Settings (7 steps)

| # | Type | Anchor | Tooltip |
|---|---|---|---|
| 1 | SHOW | `nav.settings` | **Settings** — your business details and how you get paid. |
| 2 | GO → SHOW | `profile.logo` on `/settings/business` | Your logo and business name go on every invoice. |
| 3 | SHOW | `profile.handles` | Add Cash App, PayPal, Venmo, and Zelle. They print on every invoice. |
| 4 | SHOW | `profile.style` | Pick an invoice style and colors that look like you. |
| 5 | GO → SHOW | `payouts.stripe` on `/settings/payouts` | Connect Stripe so clients can pay by card, Apple Pay, Google Pay, or Cash App Pay. *(Demo: the button is disabled.)* |
| 6 | GO → SHOW | `settings.vault` on `/settings` | **Records** keeps a copy of every PDF you've sent. |
| 7 | SHOW | `settings.help` | Replay this tour or read **How On It works** any time, right here. |
| end | CARD | — | **That's On It. Back to your real data →** (exits demo, returns to Chat) |

### 5.6 Entry points
- **First run** (D1): a one-card prompt over Chat, "Take the 3-minute tour / Skip for now". It's gated by the existing `TUTORIAL_VERSION` mechanism in `components/tutorial/persistence.ts` (bump to 2).
- **Settings › Help › Replay the walkthrough** (already dispatches `onit-replay-walkthrough`): opens the **tour picker**, a sheet with "Full tour" plus the five tabs, each with a step count.
- **Later (not in this build):** chat hub deep links such as "where do I save a client?", which open Clients at step 2. The engine must accept `start(tab, stepId)` from day one so this needs no rework.

---

## 6. Design brief for Claude Design (overlay system only)

Design these, as an interactive prototype on top of 2–3 real On It screenshots: **Clients list**, **Chat with a draft card**, and **Books**. Deffeu supplies those screenshots. No other screens need to be drawn.

1. **Scrim + spotlight:** a dim layer with a rounded cutout around the target, padding 8 px, radius matching the target (pills stay pills). The scrim colour is `on-background` (#1f1b13) at about 55%, never pure black.
2. **Tooltip card:**
   - Surface `#ffffff` (surface-container-lowest), radius 20, soft shadow.
   - Title (optional, bold) plus 1–2 lines of body.
   - Step counter ("4 of 9").
   - **Next** is primary: gold fill `#d4af37` with dark text `#1f1b13`, never white text on gold.
   - **Skip tour** is a quiet text link.
   - A pointer notch aims at the spotlight.
   - It sits above or below the target, whichever has room, and never covers it.
3. **TRY state:** the tooltip says "Tap it", there's no Next button, and a soft pulse ring (gold `#e9c349`) loops on the target until it's tapped.
4. **Continue card** (end of each tab): a full-width bottom sheet with the tab icon, "Clients — done", primary **Continue to the Invoices walkthrough →**, and secondary **Done for now**. On the final tab: **Back to your real data →**.
5. **Demo badge:** a small persistent pill at the top, "Tour · sample data", so nobody thinks their books changed.
6. **Tour picker sheet** (§5.6).
7. **Motion**, using On It's tokens and nothing new:
   - Spotlight travel between targets: `--motion-base` 240 ms, `--ease-emphasized`.
   - Tooltip fade + 8 px rise: `--motion-fast` 160 ms, `--ease-standard`.
   - Tab change: the spotlight closes, the real tab transition plays, and the spotlight opens on the new target.
   - Continue card rises: `--motion-slow` 400 ms.
   - `--ease-spring` only on the final "That's On It" card.
   - With `prefers-reduced-motion`, everything is instant cross-fades.
8. **Mobile first:** a 375 × 812 frame. Tooltip max width is 340 px. Touch targets are at least 44 px. It must work with the keyboard open (step 4 of Chat edits a number).

**Output wanted from Claude Design:** the interactive prototype plus exact values (sizes, colors, timings) for each element above, so the coding agent can match it without guessing.

---

## 7. Engineering — demo sandbox (the part that must be airtight)

### 7.1 Demo mode switch
- `src/lib/walkthrough/demo-mode.ts` holds the module state `isDemo()`, plus `enterDemo()` and `exitDemo()`. Entering and exiting dispatches `onit-demo-change`.
- Demo state lives in memory only (plus `sessionStorage` so a reload mid-tour lands back in the tour). It is never written to the database.

### 7.2 Fake database client
- `createClient()` in `src/lib/supabase/client.ts` returns a **demo client** when `isDemo()` is true.
- The demo client implements only the query-builder subset the app uses. The crawl found these:
  - **Tables** (`.from`): `invoices, products, clients, profiles, recurring_expenses, expenses, recaps, invoice_payments, vault_documents`.
  - **Builder methods:** `select, eq, is, in, not, gte, gt, lte, lt, ilike, contains, match, order, limit, range, maybeSingle, single`.
  - **Writes:** `insert, update, upsert, delete`.
  - **RPCs:** `client_summaries, save_client, client_name_usage, repeat_candidate, record_product_use`.
  - **Storage:** `logos` (upload, remove, getPublicUrl), `receipts` (createSignedUrls → bundled thumbnails), `vault` (createSignedUrl → bundled sample PDFs, upload → no-op).
  - **Auth:** `getUser` and `getSession` pass through to the real client. `signOut` is blocked (§7.4). **Audit every call site first** and list the exact methods used. Anything unhandled must **throw in development** and return empty data in production.
- **Every write is a no-op** (`insert / update / upsert / delete`, and write RPCs). It resolves with a believable success shape so the UI animates, and never touches the network.
- `auth.getUser()` keeps returning the real user (screens gate on it). Data queries never reach Supabase in demo.
- **Screens are re-mounted** on enter/exit (key the app shell on demo state) so no real rows linger in component state and no demo rows leak out.

### 7.3 Network calls outside Supabase
Wrap `fetch` for `/api/*` while in demo:

| Route | Demo behavior |
|---|---|
| `/api/parse`, `/api/transcribe`, `/api/parse-receipt` | Return scripted fixtures. **No AI calls, no cost.** |
| `/api/access` | Returns `active` (Pro features visible). |
| `/api/zelle` | Returns the demo Zelle value. |
| `/api/checkout`, `/api/connect/*`, `/api/redeem`, `/api/push/test`, `/api/delete-account` | **Blocked**: resolve to a no-op and show a toast, "Not available in the tour". |

### 7.4 Device actions to block in demo
- `navigator.share` (Share PDF / send): show a toast, never open the share sheet.
- File downloads: allowed. A demo PDF of sample data is harmless and shows the product. The file is named "Sample – …".
- Camera, gallery, mic: tooltip-only (SHOW), never TRY. Don't open hardware in the tour.
- `tel:` / `sms:` / `mailto:` on client detail: links point at fixture numbers in the 555-01xx range. Tapping is blocked with a toast.
- Sign out, delete account, plan purchase, Stripe connect: disabled while in demo.

### 7.5 Local storage isolation
Chat history, drafts, and templates live in `localStorage`, namespaced by user (`storageNsRef`). In demo, use namespace `demo:<userId>` and **clear it on exit**. The user's real chat, drafts, and template rows must be byte-for-byte unchanged after a tour. Add a test that snapshots the user's keys before the tour and compares them after exit.

### 7.6 Exit paths (all must restore real data)
Skip tour · Done for now · final card · Android back past the first step · app backgrounded for more than 30 minutes (exit on return) · sign-out attempt · a paywall or crash inside the tour (error boundary exits demo first).

---

## 8. Engineering — coach-mark engine

- `src/components/walkthrough/` holds `WalkthroughProvider`, `CoachOverlay`, `TooltipCard`, `ContinueCard`, `TourPicker`, and `steps.ts` (§5 as data).
- A step is `{ id, tab, route?, type: 'show'|'try'|'go', anchor, title?, body, advanceOn?: 'tap'|'event' }`.
- The engine:
  1. Navigates (when `route` is set).
  2. Waits for `[data-tour=anchor]` to exist and be visible (max 3 s, then skip the step and log it).
  3. Scrolls it into view.
  4. Measures it with `getBoundingClientRect`, and re-measures on resize, scroll, and keyboard (`visualViewport`).
  5. Draws the cutout.
- **TRY steps** let exactly one tap through to the target: the overlay has `pointer-events: none` inside the cutout. The step advances on that tap or on a named event.
- **z-index:** the overlay sits above the app and the PaywallModal (`z-[70]`). Use `z-[80]`. Bottom sheets opened by a TRY step (Add expense) must render *under* the overlay with their target still spotlit.
- **Accessibility:** the tooltip is `role="dialog"`, `aria-modal`. Focus moves to it, and the text is read out. Esc means Skip tour. The step counter is announced.
- **Persistence:** `onit_walkthrough_done:<userId>` = list of completed tabs, so the picker can show ticks.
- Adding `data-tour` attributes is a separate commit per tab, with no visual change.

---

## 9. Build plan (one branch per phase, one commit per item)

1. **Phase 1 — sandbox first, no UI.** `demo-mode.ts`, `demo-data.ts` plus the totals test, the demo Supabase client (after the call-site audit), the `/api` and device guards, and storage isolation plus its test. Acceptance: with demo forced on, every tab renders the sample business, and a full click-around saves nothing (verify the network tab shows zero Supabase writes and zero `/api` calls beyond fixtures).
2. **Phase 2 — engine plus the Clients tour.** Overlay, tooltip, continue card, built to Claude Design's values, plus the Clients `data-tour` anchors. Acceptance: the Clients tour runs end to end on a 390 px iPhone, every exit path restores real data, and reduced motion works.
3. **Phase 3 — the other four tours,** one commit per tab.
4. **Phase 4 — entry points.** First-run prompt (D1), tour picker, remove the old carousel, bump `TUTORIAL_VERSION`.
5. **Later — chat hub deep links** (`start(tab, stepId)` is already in place).

**Not touched:** database schema, RLS, migrations, `/api/followups`, the Stripe webhook, checkout. The sandbox is client-only.

---

## 10. Risks

1. **Fake client gaps** (biggest risk). An unhandled query method means a screen crashes mid-tour. Mitigation: the call-site audit, dev-mode throws, and the Phase 1 click-around.
2. **Leaking demo into real data.** Mitigation: writes are no-ops at the client layer, storage is namespaced, there's a byte-compare test, and the app re-mounts on exit.
3. **Anchors drifting** as the UI changes. Mitigation: `data-tour` attributes only. A missing anchor skips its step and logs it. Add a CI check that every anchor in `steps.ts` exists in the source.
4. **Tour length.** 46 steps across 5 tabs is about 4–5 minutes in total. Each tab is under 1 minute, and Skip is always one tap away. If testers drop off, cut SHOW steps first and keep the TRY steps.
