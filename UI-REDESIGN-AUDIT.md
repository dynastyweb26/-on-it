# On It — UI redesign audit (feat/ui-redesign)

Audit only: no code changed, no migration applied. Branch `feat/ui-redesign`
(from `main` 683301b + `1c1ee80`, the design reference). Written 2026-10-03.

Design source: `design-reference/on-it-motion.html` ("On It. Motion pass",
Claude Design). It holds **five playable prototypes** (M1 Send invoice, M2 Save
client, M3 Make recurring, M4 Invoice marked paid, M5 Tab switch) and a
**37-row motion inventory**. The drawn screens it refers to — "the release
frames", `On It Next Release.dc.html` — are **not in the repo** (see Blockers).

Line numbers are for `main` at 683301b.

---

## 0. Blockers and surprises (read first)

1. **Release frames missing.** `on-it-motion.html` describes the composer
   expand, the guided template, the keypad and the list screens only as text in
   its inventory. It has one send button, not "option A". The geometry for
   these is in `On It Next Release.dc.html`, which isn't in `design-reference/`:
   - send-button options A/B/C;
   - two-row line items, qty stepper, keypad keys, units picker;
   - the Clients / Products / Recurring screens and the "Pro" tag.

   Items 1, 2 and 4 can't be specced to the pixel until it's added.
2. **"View expenses" was never removed.** It is live on `main`:
   - Code: `src/app/(app)/dashboard/page.tsx:287-293` — outline Link →
     `/expenses`, `receipt_long` icon, rises at 400 ms.
   - Docs: MOTION-SPEC.md:142, PUNCH-LIST.md:439.
   - History: added in `29757ee`. `9589677` only changed the *other* button's
     icon ("Income & Expenses" → `description`). No commit removed it.

   If you don't see it on device, that's a stale PWA or deploy, not a revert.
   See Q1.
3. **A `clients` table already exists and is filled silently.** Every
   finalize upserts the client (`chat/page.tsx:1455-1464`) and links
   `invoices.client_id` (:1509). So "Save to your list?" can't mean "create the
   row"; it has to mean "promote an auto-captured client to your saved list"
   (proposal in §5).
4. **The design's composer differs from the locked decision.** M1 shows a
   small soft-gold (#F0E3B8) 44 px "+" beside a "Message On It…" pill, with no
   camera, gallery or send button. You locked the *current* bar with only the
   mic → gold "+" (same 72 px size). This audit follows your decision and
   borrows only the expand motion. The design labels the option **"Voice"**,
   not "Mic", and fans the options on a **12° arc** (Q3).
5. **Easing tokens disagree.** The design's `ease.emphasized` is
   `cubic-bezier(.2,0,0,1)`. That equals MOTION-SPEC's `--ease-standard`; the
   repo's `--ease-emphasized` is `(.65,0,.35,1)`. The designer calls the
   curves "stand-ins" because the On It motion kit wasn't available to them
   (Q12).

---

## 1. Composer: mic → gold "+" with expand (Voice · New invoice · New quote)

### Files touched
- `src/app/(app)/chat/page.tsx` (2958 lines)
  - Composer: 2813-2914. Gold circle: 2880-2894 (`h-fab w-fab` = 72 px,
    `bg-primary-container`, `data-splash-target`, `disabled={phase !== null}`,
    `onClick={micTap}`).
  - Camera/gallery: 2845-2864, hidden while `voiceSession`.
  - Voice:
    - `micTap()` 2198-2211 — calls `primeSpeech()` *inside the tap*.
    - `getSessionStream()` 2136-2146 and `startRecording()` 2148-2196.
    - `endVoiceSession()` 2213-2224.
    - Voice state 471-495.
  - "Listening… tap the mic when you're done." copy at 2819; stale header
    comment at :6.
- `src/components/MicRings.tsx` (positioned inside the gold button's wrapper,
  2881-2882).
- `src/components/Splash.tsx:103-107` — the cold-start splash flies onto
  `[data-splash-target]`, which is the gold button.
- Tutorial:
  - `src/components/tutorial/mocks.tsx:75-102` (`MockComposer`, gold mic,
    `data-spotlight`).
  - `slides.tsx:41-56, 205-220` (`spotlight: 'mic'`).
  - `FirstRunTutorial.tsx:12` (`FIRST_RUN_IDS[0] = 'mic'`).
- Icons (`src/components/icon-names.ts` + `npm run icons:build`): `add`/`close`
  exist. The options need e.g. `mic`, `description`, `request_quote` (all
  exist).
- `globals.css`: new keyframes/classes. Design docs to update:
  ON-IT-DESIGN-STANDARD §8/§141 (voice FAB), BATCH-4A-SPEC:71-91,
  MOTION-SPEC §11.

### Behaviour (proposal)
- **Idle.** The 72 px gold circle shows `add`; tap opens the menu.
- **Open.** The + rotates 45° into ×. Voice · New invoice · New quote rise
  from the button (design: 12° arc, nearest first, 45 ms stagger). A cream
  scrim fades over the chat. 300 ms spring, light haptic.
- **Close.** Tap ×, the scrim or an option: everything reverses together,
  180 ms exit.
- **Voice.** Must call `micTap()` **synchronously in that tap**. Any
  `setTimeout`/animation wait before it breaks iOS `primeSpeech()` and the mic
  permission prompt. Close the menu *after* calling it.
- **During a voice session** the gold circle should stay the mic/stop control
  (it starts/stops takes today) and go back to "+" when the session ends.
  Otherwise there is no way to stop a take (Q4).
- **Keep on the "+":** `data-splash-target` and MicRings' wrapper, so the
  splash still lands on the gold circle. Keep `disabled={phase !== null}`
  (the menu can't open while thinking or building).
- **The menu** needs `data-no-tab-swipe="true"` (an inline/absolute menu
  doesn't block tab swipes). Its z-index must sit below PaywallModal (z-70)
  and UndoToast (z-90) and above the history sheet (z-50).

### Conflicts
- Gesture rules: TTS priming, `getUserMedia` and the synchronous share
  (iOS drops the gesture after awaits).
- The tutorial spotlights the mic; first-run slide 1 is "Tap the mic". This
  needs new copy and a new mock.
- The Chat **tab** icon is also `mic` (layout.tsx:29). The design's nav uses
  `chat_bubble` for Chat (Q5).

---

## 2. Guided template for New invoice / New quote

### Files touched
- `src/app/(app)/chat/page.tsx`:
  - Draft card `invoiceCard` 2463-2665.
  - Send button "Looks right — send it" 2618-2636.
  - `finalize()` 1337-1771 and `settleShare()` 1779-1831.
  - Pre-build effect 1320-1330.
  - Seed-a-draft patterns: `resolvePendingChangeNew()` 2362-2392,
    `startRevision()` 2421-2455.
- `src/components/LineItemsEditor.tsx`: the only line-item editor. Shared with
  the draft detail page `invoices/[id]/page.tsx:813`. Tap-to-edit cells with
  `inputMode="decimal"`, Up/Down/Dup/Delete, rows keyed by index (`key={i}`,
  :133). No stepper, no keypad.
- `src/lib/ai.ts:9` `LineItem {description, qty, unit_price}`;
  `src/lib/financials.ts:10-13`.
- Units would also touch:
  - PDF templates `src/lib/pdf/templates/index.tsx:354, 582` (qty only).
  - `src/app/pay/[token]/PayView.tsx:489-491` (`qty × unitPrice`).
  - `draftFingerprint` (chat :169) and duplicate math (`api/parse` ~378).
  - The public RPC `get_public_invoice`
    (`20260926100000_pay_with_card_rpcs.sql:61-71` rebuilds each item as
    `{description, qty, unit_price}`, so a `unit` key is dropped on
    `/pay/[token]`).
- Icons missing from the subset: `remove` (stepper −), `backspace` (keypad),
  `north_east` (↗), `person`.

### What the design gives (M1 + inventory)
- Card: #F7F0E2, border #EADFC9, radius 22, 12 px padding/gap.
- Client chip: dark #2E2822, 42 px high, `person` icon in gold.
- Line rows: **single-row** ("Materials 5 × $2.00 each $10.00").
- Total: Montserrat 800 20 px.
- Send: gold pill 46 px, "Send invoice" 700 16 px + a 38 px dark circle with
  `north_east`.
- Motion:
  - Opening: "field grows into the template card", slots stagger 30 ms
    (Name → Item → Add item → Extra info), rise 6 px, 360 ms.
  - Slot filled: dashed placeholder → solid chip, 1.04 pop, 320 ms spring.
  - Qty ±: number rolls, totals roll like an odometer, 140 ms.
  - Keypad sheet: rises, 320 ms.
  - Add item: expands from 0 height, 380 ms.
  - Remove item: collapses, 5 s undo, 320 ms.
  - Send enabling: gold sweep, then ↗ pops, 400 ms.
- Send sequence (M1, 0→900 ms): arrow flies off, composer folds up, invoice
  card springs in, "↗ SENT" stamp.

Your spec (two-row items, stepper, keypad, units, option A) needs the missing
release frames (Blocker 1).

### Behaviour (proposal)
- **A template is a draft seeded locally, not via `/api/parse`.** Same path as
  `startRevision()`:
  - archive the current conversation;
  - **new `convoId`** (it is the `finalize_key`, one conversation = one row);
  - clear `pendingInvoiceRef` and link state, reset `originalDescriptionsRef`;
  - `draft.intent = 'invoice' | 'quote'`, `intent_explicit = true`.

  Don't reuse `onit-new-chat` as is: it no-ops with only the greeting (761) and
  doesn't reset `voiceSession`, `prepState`, `shareWaiting` or
  `duplicateHint`.
- **Don't set `ready` while the user is still filling it in.** The pre-build
  (1320-1330) inserts an `invoices` row 400 ms after any ready change. That
  would burn invoice numbers and, for free users, count toward the 3-invoice
  cap (soft-deleted rows count). Pre-build only once Send becomes enabled
  (name + ≥1 priced line). Quotes keep the pre-build.
- **"Send invoice ↗" must route through `finalize()`.** That keeps:
  - the paywall gate (1411-1426) and the `PAYWALL_LIMIT` hint handling (1534);
  - the synchronous share (pre-built file or the `shareWaiting` second tap);
  - the client upsert and the lock/history.

  Quotes stay uncapped (DB trigger, `access.ts` and client all filter
  `kind='invoice'`).
- **Keypad.** A custom keypad (buttons) doesn't set `html[data-kb]`, so the
  tab bar and install banner stay visible. The template must be a fixed layer
  that covers them. Mixed real inputs (Name, Item) + a custom keypad can open
  both keyboards at once. Make the qty/price fields `readOnly` buttons that
  open the keypad (readOnly inputs don't count as text entry in
  `src/lib/keyboard.ts:44-49`).
- **Units.** Store as an optional `unit` key in each `line_items` element
  (JSONB; no column). Display "5 materials × $2.00".
  - **Quantity stays numeric:** `qty` 0–100000, 2 dp, same clamps.
  - Needs: the RPC migration (§Data model C), PDF templates, PayView,
    LineItemsEditor, `draftFingerprint`, the parse route normaliser, and the
    AI prompt.
  - The AI prompt (ai.ts:62-64) currently keeps a stated quantity *in the
    description* ("Installed 3 blinds…") — it would need a rule to extract
    qty + unit.
- **Placeholder guide text** [Name, Product/Service, Price, Extra info]: Extra
  info maps to `draft.notes` (≤500 chars, existing).

### Conflicts
- **Guest flow.** Guests get 5 parses via a cookie. A template bypasses
  `/api/parse` and its guards: generic-client-name guard, line-item
  normaliser, 48 h duplicate warning, `cardSummary`. Decide whether guests
  may use templates (Q6), and replicate the duplicate check client-side or
  call it at Send.
- `lock_line_items` allows edits only while `status='draft'` (fine).
- **AI flow.** A user can still type into chat while a template is open
  (Q7: does chat text fill the template, or is the template modal?).

---

## 3. Nav: Clients · Invoices · Chat (center) · Books · Settings

### Files touched
- `src/app/(app)/layout.tsx`:
  - `TABS` 25-33.
  - `getParentRoute` 16-23.
  - Swipe 185-224 (index-generic; comment :216 assumes Chat is first).
  - Pill measurement 101-121, 297-310 (measures each link, so 5 tabs work).
  - `BooksDot` 330-340.
  - Header buttons keyed on `path.startsWith('/chat')`.
- New route `src/app/(app)/clients/page.tsx`. `src/app/api/checkout/route.ts:18`
  `RETURN_PATHS` needs `clients` if the paywall can open from there.
- Tutorial:
  - `mocks.tsx:17-39` (`TabKey`, `MOCK_TABS`, 4 tabs).
  - `TutorialReference.tsx:19-25` (tabs "in nav order").
  - `slides.tsx` `SlideTab`.
- Docs: ON-IT-DESIGN-STANDARD §4 (no Clients icon), MOTION-SPEC §10.
- Icons to add + font rebuild: `group` (Clients), and `chat_bubble` if Chat
  changes icon. `person`/`person_add` for M2.

### Design (M5)
- Bar 84 px. Pills 58×32 with 24 px icon; **Chat 64×36, raised 4 px, 27 px
  icon**.
- Active disc gold; Chat keeps a soft #F0E3B8 pill when not active.
- Disc slides `left .34s spring` + size `.2s emphasized`; icon bounce 340 ms;
  screen `fadeUp .16s`.
- Press `scale(.95)` (Chat `.9`); selection tick haptic.

### Conflicts
- **Width.** 5 links at `px-4` + 12 px labels inside `max-w-lg px-2` may crowd
  at 375 px. The design uses 58 px pills with 11.5 px labels.
- **Pill.** It currently transitions `width` (a layout property, against
  MOTION-SPEC's transform/opacity rule).
- **Swipe.** Chat moves from index 0 to 2, so left/right swipe from Chat now
  goes both ways. Slide direction stays index-based (fine).
- **Landing.** Every entry still lands on `/chat` (page.tsx:5, onboarding,
  login, reset, auth/confirm, i/[token], RecapProvider `/chat?new=1`).
  Unchanged, but Chat is no longer the left edge.
- **BooksDot** placement re-checked for the new pill size.

---

## 4 + 5. Saved Clients, Products & Services, Recurring Expenses ("Pro")

### Files touched
- New:
  - `src/app/(app)/clients/page.tsx` (Clients tab; the design puts
    **Products as a segment inside Clients**, "A–Z clients + items").
  - Client detail.
  - Recurring list (Books or Settings, Q9).
  - "Save to your list?" prompt component (M2/M3 style: dark card above the
    composer, no scrim).
- `chat/page.tsx`: client lookup 961-974 (`.ilike('name', …)` — **unescaped
  `%`/`_` act as wildcards**), upsert 1455-1464.
- Expenses: chat expense flow ~1945-2090, Books add-expense sheet
  `dashboard/page.tsx:296-380`.
- `src/lib/recap/payload.ts:98-115` (topClient keyed on the trimmed name,
  case-sensitive); `notify/recaps.ts` (reads `invoices.client_name`, never
  `clients`).
- Pro tag: none exists (no badge component, no "Pro" tier).
  `RecapsCard.tsx:29-42` (locked card) is the nearest pattern.

### "Save to your list?" semantics (proposal)
- **Clients** are already auto-captured (silent upsert). Add `saved_at`.
  - The list shows only saved clients.
  - The prompt fires at finalize when the client already exists (matched on a
    normalised name), `saved_at is null`, and it's at least the 2nd invoice for
    that client.
  - "Not now" stamps `prompt_dismissed_at` so it isn't asked every time (Q8).
- **Products/services** have no table. Count by a normalised description from
  past `line_items` (`count(*) where lower(btrim(item->>'description')) = …`),
  or record usage in the new table on each finalize with `saved_at null`
  (preferred: one indexed lookup).
- **Recurring.** Design M3: "Adobe charged $54.99 again. Make it a monthly
  recurring expense?" Trigger when a new expense matches a previous expense's
  vendor (normalised) and amount within a cadence window (≈ 25–35 days for
  monthly). Accepting creates a `recurring_expenses` template.

### Conflicts
- **Expense cap.** A recurring template that *auto-logs* expense rows fires
  `enforce_free_expense_limit` (5 since reset, counts soft-deleted, fires even
  for service-role inserts).
  - If Pro = the paid tiers, the paid tiers are unlimited and there's no
    conflict.
  - If free users can have recurring before gating lands, auto-logging will
    hit `PAYWALL_LIMIT_EXPENSE` from the cron (Q10).
- **Recaps.** Auto-logged rows change recap numbers (spend, net,
  top_category/top_vendor, expenses_count) for the period they land in. That's
  correct behaviour but new. Snapshots already built never change
  (insert-once).
- **Recap top client** is case-sensitive ("Bob Smith" ≠ "bob smith"). A
  normalised client key should feed the same rule later (separate commit).
- **Capped invoice.** The client upsert runs *before* the capped invoice
  insert, so a blocked free user still gets a clients row (harmless; noted).
- **"Pro" gating.** There's no tier above the paid tiers today
  (`PAID_TIERS = founder, trialing, active, past_due`). "Pro" as a tag-only
  label is UI; real gating later needs a decision (Q11) and DB enforcement
  (a trigger like the caps). TS and SQL tier lists must match
  (`src/lib/access.ts:30-34`).

---

## 6. Alphabetical sorting within each month

### Files touched
- `src/app/(app)/invoices/page.tsx`:
  - Fetch `order created_at desc limit 200` (63-68).
  - Sort `created_at desc || client_name A→Z` (98-100). Tier 1 is a full
    timestamp, so A→Z never applies.
  - `groupByPeriod(…, 'month')` (107).
- `src/app/(app)/expenses/page.tsx`:
  - Sort `spent_on desc || (vendor || description) A→Z` (97-100).
  - **Grouped by week** (105), with weekly subtotals on `DateDivider` (163).
- `src/lib/date-groups.ts:50-67` (`groupByPeriod` keeps input order).

### Change
- Group by month first, then sort each group's items by name (case-insensitive
  `localeCompare(…, { sensitivity: 'base' })`), tie → newest first.
- Expenses switch `'week'` → `'month'`. **That drops the weekly subtotals**
  (Q2). No DB change.

### Conflicts
- Applies to every invoice filter chip (All / Unpaid / Paid / Quotes).
- `limit 200`: months beyond the newest 200 rows aren't shown (unchanged, but
  more visible with month groups).
- The design inventory: "New entry saved slides into its A–Z slot, gold glow".

---

## 7. "View expenses" button

Live on `main` (Blocker 2). If the request is a different placement (e.g.
under the Spent tile, or the design's "See all expenses →"), say which (Q1).
Otherwise nothing to do.

---

## Data model — proposed migrations (NOT applied)

Process for every one (CLAUDE.md):
1. dry run;
2. exact file list;
3. your "yes" in that conversation;
4. `db push`;
5. `npm run db:privcheck`.

Each adds SKIP-gated check rows (P1/P2/P3 pattern) in
`supabase/snippets/privilege_check.sql`. Names sort after
`20261002000001`. Every text column gets a CHECK cap (SECURITY.md:23). Every
new table gets RLS + owner policy in the same file (SECURITY.md:27).

### A. `2026101000000x_clients_saved_list.sql`
- **Columns.**
  ```sql
  saved_at timestamptz,
  prompt_dismissed_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name_key text generated always as (lower(btrim(name))) stored
  ```
- **Dedupe preflight.** Read-only, run first:
  ```sql
  select user_id, lower(btrim(name)), count(*) from clients group by 1,2 having count(*) > 1
  ```
  If rows come back, the unique index below fails. The migration must merge
  them first or the index waits (Q13).
- **Index.** Replace `unique (user_id, name)` with
  `unique (user_id, name_key)`. The chat upsert switches to `onConflict:
  'user_id,name_key'`. A unique index on a stored generated column is a
  valid `ON CONFLICT` target, but verify it on the local Postgres stub. That
  also fixes the unescaped `ilike` lookup (match on `name_key` instead).
- **RLS.** Split today's `FOR ALL` "own clients" policy into
  select/insert/update (no DELETE: soft delete via `deleted_at`). Matches
  invoices/expenses.
- **Grants.** `revoke all … from anon`; `revoke truncate, references,
  trigger`. Authenticated keeps select/insert/update. `email` stays writable
  (unused today).
- **Privilege check rows:** RLS on, policy set, no DELETE, anon nothing.

### B. `…_products_services.sql`
- **Table.**
  ```sql
  create table public.products (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    name text not null check (char_length(btrim(name)) between 1 and 120),
    name_key text generated always as (lower(btrim(name))) stored,
    unit text check (unit is null or char_length(unit) <= 20),
    unit_price numeric(12,2) check (unit_price is null or unit_price between 0 and 10000000),
    kind text not null default 'service' check (kind in ('product','service')),
    use_count integer not null default 0 check (use_count >= 0),
    last_used_at timestamptz,
    saved_at timestamptz,
    prompt_dismissed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    unique (user_id, name_key)
  );
  ```
- RLS owner select/insert/update, no DELETE. Grants as in A. Privilege check
  rows.
- `use_count` writes: client-side increment is racy. Prefer an
  `increment_product_use(name)` RPC (`security invoker`, owner-scoped), or
  accept approximate counts (Q14).

### C. `…_public_invoice_line_unit.sql`
- No table change: `unit` lives inside `invoices.line_items` JSONB.
- `create or replace function get_public_invoice(...)` to pass through
  `'unit', item->>'unit'` (and keep `original_description` out, as today).
  Same signature and grants. **Security-relevant:** it's the public pay-page
  RPC. Its H-section check rows must still PASS.
- Optional: a CHECK that each item's `unit` is ≤ 20 chars (needs a function
  over the JSONB array; maybe skip and validate in the app).

### D. `…_recurring_expenses.sql`
- **Table.**
  ```sql
  create table public.recurring_expenses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    vendor text check (vendor is null or char_length(vendor) <= 120),
    description text check (description is null or char_length(description) <= 200),
    amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
    category text not null default 'other' check (category in
      ('food','fuel','supplies','tools','travel','maintenance','subscriptions','phone','insurance','other')),
    cadence text not null check (cadence in ('weekly','monthly','yearly')),
    next_on date not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
  );
  ```
- On `expenses`:
  `add column recurring_id uuid references public.recurring_expenses(id) on delete set null`,
  plus a unique `(recurring_id, spent_on) where recurring_id is not null`.
  That makes a cron re-run idempotent.
- RLS owner select/insert/update. Auto-logging runs from the daily cron as
  the service role (`/api/followups`, like recaps).
- Privilege check rows. The expense-cap interaction stays as is (Q10).

### E. (later) Pro tier
Not proposed until Q11 is answered. If it's a new `access_tier` value, the
`profiles_access_tier` CHECK, `PAID_TIERS`, both cap triggers and `access.ts`
change together, and the privilege check's B list is unaffected
(`access_tier` is already privileged).

---

## Motion inventory

The design's inventory (37 rows) vs MOTION-SPEC (§1–11 shipped; §12 is stale:
it describes the removed RecapSheet). "Spec" = an existing MOTION-SPEC rule
covers it.

| Screen / action | Design (on-it-motion.html) | MOTION-SPEC today | Status |
|---|---|---|---|
| Composer + open | + → ×, options on 12° arc, 45 ms stagger, cream scrim, 300 ms spring, light haptic | — | **Gap → new §** |
| Composer close | reverse together, 180 ms exit | — | **Gap** |
| Template opens | field grows into card, slots stagger 30 ms, rise 6 px, 360 ms | §3 card build-in (chat card only) | **Gap** |
| Slot filled | dashed → solid chip, 1.04 pop, 320 ms spring | — | **Gap** |
| Pick from sheet | sheet down, row text hands off into the slot (shared element), 340 ms | — | **Gap** |
| Qty − / + | number rolls one step, totals odometer, 140 ms, selection tick | §9 roll is Books-only | **Gap** |
| Keypad | sheet rises 320 ms, live line total | — | **Gap** |
| Add / remove item | expand from 0 h 380 ms / collapse 320 ms + 5 s undo | — | **Gap**; LineItemsEditor `key={i}` blocks per-row animation, needs stable ids |
| Send enabled | gold sweep L→R then ↗ pops, 400 ms | §3 send button fades in last | **Replace** |
| Send invoice / quote | M1: press .94, arrow flies off, composer folds, card springs in, SENT stamp; 1,100 ms, success haptic | §4 lock on send (chip, padlock) | **Replace §4** (decide which survives, Q15) |
| Save client / item | M2: chip flies in an arc into the Clients tab, tab bumps, "+1" blooms, confirmation bubble; 1,000 ms spring, success haptic | — | **Gap** |
| "Save to your list?" prompt | slides up 14 px, spring, no scrim, 320 ms; Not now sinks 10 px 180 ms | — | **Gap** |
| Make recurring | M3: gold ellipse draws round the amount, "Monthly" tag pops, ↻ spins in, shimmer; 950 ms | — | **Gap** |
| Recurring auto-logged | shimmer + "Logged automatically", 900 ms | — | **Gap** |
| Marked paid | M4: PAID stamp (spring, −8°), card dips, button turns green, tiles count up 700 ms, Collected glows; 1,200 ms | §6 gold sweep + status spring + bump + `vibrate(12)` | **Replace §6** (Q15) |
| Tab switch | M5: disc slides 340 ms spring, icon bounce, screen fadeUp 160 ms | §10 pill glide 300 ms + 28 px side entry | **Update §10** |
| Invoices filter | outline slides, list crossfades with a 12 px shift, 200 ms | §10 selected ring | **Partial** |
| Status change on list | tag crossfades, icon flips, 300 ms | §6 list chip pop (deferred, not built) | **Gap** |
| New entry in list | slides into A–Z slot + 1.2 s gold glow | — | **Gap** (item 6) |
| Swipe to delete / undo | resistance past 40 %, 300 ms, warning haptic / undo 300 ms spring | SwipeableRow 200 ms snap, not in spec | **Gap** (toast has no entrance) |
| Long-press row | 1.02 scale, list dims, 220 ms spring | — | **Gap** |
| Search | 160 ms | — (no search exists) | **Gap** |
| A–Z letter jump | 300 ms + 400 ms gold pulse | — | **Gap** |
| Client detail | shared avatar/name, stats count up, 380 ms | — | **Gap** |
| Form save | label → ✓, sheet slides down, 400 ms, success haptic | — | **Gap** |
| Unit / frequency segment | thumb slides 180 ms spring, tick | — | **Gap** |
| Chat new message | typing dots (900 ms loop), bubble rises 8 px, 240 ms | §2 reply rises 6 px (not built) | **Spec, unbuilt** |
| Receipt snapped | thumbnail shrinks into a bubble, scan line, 600 ms | §8 shutter + photo lands | **Update §8** |
| Books first visit | count-up 700 ms | §9 (built) | **Spec** |
| Books recaps dot | ring pulse once, 600 ms | — | **Gap** |
| Books tile press | scale .97, 120 ms | §9 Net press .98 | **Spec-ish** |
| Failed action | shake 6 px × 3 decaying, inline Retry, warning haptic, 360 ms | §7 shake 320 ms (built) | **Update §7** |
| Empty states | — | — | **Gap** (not in either) |
| Bottom sheets (generic) | — | inconsistent: `onit-sheet-in` / `paywall-in` / none, no exits | **Gap**: one sheet rule |
| Toasts (UndoToast, PayView toast) | — | none | **Gap** |
| Settings toggles | — | animate `left` (breaks the transform-only rule) | **Fix** |

### Reduced motion
- Design: every row → a crossfade ≤ 200 ms, numbers swap without rolling.
- Repo: a global CSS kill switch (`globals.css:468-478`) plus per-component
  `matchMedia` checks. WAAPI animations must branch themselves (Splash,
  RecapStory). A shared `usePrefersReducedMotion` hook exists twice
  (PaywallSlideshow, RecapStory); move it to `src/lib` with the first motion
  commit.

### Haptics
The design specifies haptics per row. iOS PWAs have no vibration API, so on
iPhone haptics are a no-op; only Android honours `navigator.vibrate` (Q16).

---

## Proposed commit sequence (one item per commit, safe order)

DB commits are migration files only. You apply each with the CLAUDE.md flow
**before** the code that needs it merges. Every code commit: typecheck +
`npm test` + build, then iPhone check on the branch preview.

| # | Commit | DB? | Risk |
|---|---|---|---|
| 1 | Alphabetical within month (invoices + expenses → monthly groups) | — | Low; Q2 first |
| 2 | ("View expenses": nothing, or a placement change per Q1) | — | — |
| 3 | Motion foundations: shared `usePrefersReducedMotion`, token reconciliation (Q12), sheet + toast rules, toggle fix; MOTION-SPEC §12/§13 rewrite | — | Low |
| 4 | Nav → 5 tabs, Clients route as a read-only list of existing clients, icons `group` (+ `chat_bubble`?), pill per M5, tutorial mocks/copy | — | Medium (layout, swipe, tutorial) |
| 5 | Composer "+" expand (Voice · New invoice · New quote; options stub to the current flows), splash target kept, voice-session behaviour per Q4, tutorial slide 1 copy | — | Medium (iOS gesture rules) |
| 6 | Migration A (clients saved list, name_key, RLS split) | **yes** | Medium (dedupe preflight) |
| 7 | Clients list + client detail + "Save to your list?" for clients (M2 motion) | needs 6 | Medium |
| 8 | Guided template without units: locally seeded draft, fixed layer, stepper, keypad, "Send invoice ↗" via `finalize()`, M1 motion | — | **High** (finalize/pre-build/paywall/share) |
| 9 | Migration C (public RPC passes `unit`) | **yes** | Medium (public RPC) |
| 10 | Units end to end: line-item `unit`, editor, PDF, PayView, parse normaliser + AI rule | needs 9 | Medium |
| 11 | Migration B (products) | **yes** | Low |
| 12 | Products & Services segment + save prompt + pick-from-sheet in the template | needs 11 | Medium |
| 13 | Migration D (recurring expenses + `expenses.recurring_id`) | **yes** | Medium |
| 14 | Recurring: prompt (M3), list, cron auto-log (idempotent), recap-aware | needs 13 | **High** (cap trigger, recaps) |
| 15 | "Pro" tags (visual only) | — | Low |
| 16 | Motion passes per screen (send M1, paid M4, list rows, empty states) | — | Medium |

Why this order:
- Sorting and nav are independent of the data model.
- The composer must exist before the template it opens.
- Each table lands before its UI.
- Units come after the template works without them.
- Recurring comes last, because it's the only change that writes rows on a
  schedule and touches caps and recaps.

---

## Open questions

1. **View expenses.** It's on Books today (`dashboard/page.tsx:287-293`).
   Not seeing it on device, or wanting it moved / renamed ("See all expenses →"
   in the old money mock)?
2. **Expenses grouping.** Switch to monthly (lose weekly subtotals), or keep
   weekly groups sorted A→Z inside each week?
3. **Option label and layout.** "Mic" (your brief) or "Voice" (design)?
   Straight vertical rise, or the design's 12° arc?
4. **During a voice session**, should the gold circle stay mic/stop (proposed)
   or always be "+"?
5. **Chat tab icon.** Keep `mic` or switch to `chat_bubble` (design)?
   Raised/bigger centre Chat pill per M5?
6. **Templates for guests** (not signed in), or signed-in only?
7. **Template vs chat.** While a template is open, can the user still talk or
   type to fill it, or is the template a modal form?
8. **"Save to your list?" trigger.** On the 2nd invoice for the same client
   (proposed), or any time a known name is entered? And how long does
   "Not now" last (forever for that name, or until N more uses)?
9. **Where Recurring Expenses lives:** Books ("Recurring" row), Settings,
   or the Clients tab segment like Products?
10. **Recurring and the free cap.** Recurring is Pro-tagged but gating comes
    later. Until then, should free users be able to create recurring
    templates? If yes, auto-logged rows count toward the 5-expense cap.
11. **"Pro"** = the existing paid plan (founder/trialing/active/past_due), or
    a new higher tier with its own price?
12. **Easing tokens.** The design's curves are self-declared stand-ins.
    Keep MOTION-SPEC's tokens, adopt the design's, or wait for the On It
    motion kit file?
13. **Duplicate clients by case** ("Bob Smith" / "bob smith"): merge them
    automatically in the migration (repoint `invoices.client_id`), or list them
    for you to decide first?
14. **Product usage counts.** Exact (an RPC) or approximate (client-side)?
15. **Replace §4 / §6.** Should the design's send (M1) and paid (M4) heroes
    replace the shipped lock-on-send and gold-sweep paid animations, or
    layer on them?
16. **Haptics.** OK that they're Android-only (iOS Safari/PWA has no
    vibration API)?
17. **Release frames.** Please add `On It Next Release.dc.html` to
    `design-reference/`. It's needed for send option A, two-row line items,
    stepper, keypad keys, units, the Clients/Products/Recurring screens and
    the Pro tag.
