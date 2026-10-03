# On It — UI redesign audit (feat/ui-redesign)

Audit only: no code changed, no migration applied. Branch `feat/ui-redesign`
(`main` 683301b + `1c1ee80`, the design reference). Written 2026-10-03; revised
the same day with the founder's locked decisions (§L).

Design source: `design-reference/on-it-motion.html` ("On It. Motion pass",
Claude Design). It holds five playable prototypes and a 37-row motion
inventory:
- M1 Send invoice
- M2 Save client
- M3 Make recurring
- M4 Invoice marked paid
- M5 Tab switch

The drawn screens it refers to, `On It Next Release.dc.html` ("the release
frames"), are **not in the repo** (§0). Line numbers below are for `main` at
683301b.

---

## L. Locked decisions (founder, 2026-10-03) — not open questions

**LOCKED — the chat composer is not redesigned.** The current input bar stays
exactly as it is today:
- camera + gallery stacked on the left;
- the big gold circle;
- the "Or type it…" field;
- the round send button.

Same layout, sizes, spacing, colours and behaviour. **The only change:** the
gold mic icon becomes a gold **+** in the same circle at the same size, and
the circle keeps `data-splash-target`. Tapping it plays the Claude Design
expand: + rotates to ×, and the options rise out: **Mic · New invoice · New
quote**. **Mic behaves exactly like the current mic does today.** Anything in
`on-it-motion.html` that redesigns the bar beyond the + expand is ignored and
listed in §N.

1. **Invoice sorting.**
   - A **Newest / A–Z** toggle on the invoices list, **Newest by default**.
   - **A–Z sorts by client within each month.** The month groups stay as they
     are.
   - The choice is remembered per device (localStorage).
2. **Expense sorting.**
   - Keep the weekly and monthly views and their subtotals as they are. Today
     these are the expenses list's weekly groups (clamped to months) and
     Books → Summary's week/month/quarter/year periods.
   - Only the order **inside each group** changes: **A→Z**, with the same
     Newest / A–Z toggle as invoices, remembered per device.
3. **Recurring expenses auto-log.**
   - **Real expenses.** Auto-logged rows count in Books and recaps and show a
     small **"Recurring"** tag.
   - **Easy to stop.** In Recurring Expenses each item has **Pause** and
     **Delete**. Stopping never deletes rows already logged. Any single logged
     row can still be deleted like a normal expense.
   - **Free cap.** If the 5-expense cap blocks an auto-log, don't fail
     silently: **skip it and notify the user**, e.g. "Couldn't log Rent, free
     limit reached". **Never bypass the cap.**
   - **Scheduling.** Runs from the existing daily cron. Idempotent: **one row
     per item per due date**, even if the cron runs twice. Due dates are
     computed in the **user's timezone**.
4. **Clients.**
   - Keep the silent upsert as history. Add a **"saved" flag**; the Clients
     list shows only saved clients.
   - Prompt **"Save to your list?"** on the **2nd use** of an unsaved client.
   - The migration makes the **unique key case-insensitive**. **Check
     existing data for case-duplicates first and report them; don't merge.**
   - Add **privilege-check rows for `clients`**.
   - **Products & Services** and **Recurring Expenses** get the same save
     prompt, and privilege-check rows from the start.
5. **"View expenses"** is not part of this work. It is already on `main`
   (`src/app/(app)/dashboard/page.tsx:287-293`).
6. **Fix the stale MOTION-SPEC §12** (it still describes the removed
   `RecapSheet`) in the first commit.
7. **Chat tab icon:** `chat_bubble`, in the raised centre pill per M5.
8. **Templates follow exactly the same guest rules as chat** (signed-out
   users get what chat gives them today).
9. **"Pro" = the existing paid plan** (founder / trialing / active /
   past_due). It is a visual tag only for now.
10. **Easing:** keep MOTION-SPEC's tokens. The design's stand-in curves are
    not adopted.
11. **Send and paid animations:** keep the shipped lock-on-send (§4) and
    gold-sweep paid (§6). M1 and M4 are deferred to the final motion pass
    (commit 17).
12. **Haptics:** Android-only is accepted (iOS Safari/PWA has no vibration
    API).
13. **The template is a tap-to-fill form.** No voice or typing fills it.
    Voice stays Mic → chat.
14. **Recurring Expenses is a row in Books, next to Expenses.** The Clients
    tab has two segments: **Clients · Products & Services**.
15. **Missed due dates:** back-fill at most 3, cap-checked on each one.
    Resuming after Pause never back-fills.
16. **Release frames are coming.** Commit 8 (template) waits for them.
17. **Duplicate check moves to Send.** The 48-hour duplicate-invoice check
    moves from `/api/parse` to Send, as one shared check for both chat and
    template invoices (commit 8).

---

## 0. Blockers

1. **Release frames missing.** `on-it-motion.html` describes the template, the
   keypad and the list screens only as text in its inventory, and has one send
   button (not "option A"). The geometry for these lives in
   `On It Next Release.dc.html`, which isn't in `design-reference/`:
   - send-button options A/B/C;
   - two-row line items, qty stepper, keypad keys, units picker;
   - the Clients / Products / Recurring screens and the "Pro" tag.

   Templates and list screens can't be specced to the pixel until it's added.
   The composer is not affected: it is locked to today's bar.
2. **Easing tokens disagree.** The design's `ease.emphasized`
   `cubic-bezier(.2,0,0,1)` equals MOTION-SPEC's `--ease-standard`; the repo's
   `--ease-emphasized` is `(.65,0,.35,1)`. The designer calls their curves
   "stand-ins" because they didn't have the On It motion kit. Resolved:
   keep MOTION-SPEC's tokens (L10).

---

## N. Not adopted from `on-it-motion.html` (composer lock)

The design reworks the input bar. None of this is adopted.

| Design (M1 / inventory) | Why not |
|---|---|
| A small soft-gold (#F0E3B8) **44 px "+"** (radius 22, `add` 28 px) instead of the 72 px gold circle | Locked: same circle, same size, same gold |
| A **"Message On It…"** field (44 px, #FFFDF8, border #E3D8C3) replacing "Or type it…" | Locked: field unchanged |
| **No camera, no gallery, no round send button** in the bar | Locked: all three stay |
| After a send, the bar is replaced by "+ / Message On It…" fading in (`rmFade .3s`) | Locked: today's bar stays after send |
| The option label **"Voice"** | Locked: **"Mic"** |
| "The field grows into the template card" (the composer field morphs into the template) | Locked: the bar doesn't change. The template opens as its own layer (§2) using the same grow/stagger timing |

**Adopted from the expand** (the "Composer › Tap +" and "Close +" rows):
- + rotates 45° into ×;
- the options rise out from the button, nearest first, 45 ms stagger, on the
  design's 12° arc;
- a cream scrim fades over the chat;
- 300 ms spring, light haptic;
- close reverses everything together in 180 ms (exit easing).

---

## 1. Composer: gold mic → gold "+" with expand (Mic · New invoice · New quote)

### Files touched
- `src/app/(app)/chat/page.tsx` (2958 lines)
  - Gold circle: 2880-2894 (`h-fab w-fab` = 72 px, `bg-primary-container`,
    `data-splash-target=""` at 2887, `disabled={phase !== null}`,
    `onClick={micTap}`, `<Icon name="mic" size={32} filled />`).
  - Camera/gallery: 2845-2864, hidden while `voiceSession`. Send button:
    2905-2912. Field: 2895-2904. All unchanged.
  - Voice:
    - `micTap()` 2198-2211 — calls `primeSpeech()` inside the tap.
    - `getSessionStream()` 2136-2146 and `startRecording()` 2148-2196.
    - `endVoiceSession()` 2213-2224.
    - State 471-495.
- `src/components/MicRings.tsx` (in the gold circle's wrapper, 2881-2882):
  unchanged.
- `src/components/Splash.tsx:103-107` (`[data-splash-target]`): unchanged; the
  attribute stays on the circle.
- Tutorial: `src/components/tutorial/mocks.tsx:75-102` (`MockComposer` draws
  the mic), `slides.tsx:41-56, 205-220`, `FirstRunTutorial.tsx:12`. Copy needs
  updating: "Tap the mic…" becomes "Tap +, then Mic…".
- `globals.css`: new expand keyframes. Icons `add` and `close` exist; options
  use `mic`, `description` and `request_quote` (all exist).

### Behaviour
- **Idle (no voice session):** the gold circle shows `add`. Tap opens the
  menu. Options: **Mic · New invoice · New quote**.
- **Mic option = today's mic.** Its handler calls the existing `micTap()`
  **synchronously in the same tap**, then closes the menu. Nothing in the voice
  code changes. Any timer or animation wait before `micTap()` would break iOS
  `primeSpeech()` and the mic permission prompt.
- **During a voice session** the circle behaves exactly as it does today, as
  speak/stop (mic icon, MicRings, aria-labels "Speak" / "Stop and send", the X
  to end the session, camera/gallery hidden). It shows "+" again when the
  session ends. That is what "Mic behaves exactly like the current mic" means
  in practice; otherwise a take can't be stopped.
- **The menu:**
  - `data-no-tab-swipe="true"`;
  - z-index below PaywallModal (z-70) and UndoToast (z-90), above the history
    sheet (z-50);
  - closes on scrim, ×, Escape, or picking an option;
  - Reduce Motion: crossfade ≤ 200 ms.
- `disabled={phase !== null}` is unchanged, so the menu can't open while the
  app is thinking, building or saving.

---

## 2. Guided template for New invoice / New quote

### Files touched
- `src/app/(app)/chat/page.tsx`:
  - Draft card `invoiceCard` 2463-2665.
  - `finalize()` 1337-1771 and `settleShare()` 1779-1831.
  - Pre-build effect 1320-1330.
  - Paywall gate 1411-1426 and trigger-hint handling 1534-1537.
  - Seed patterns: `resolvePendingChangeNew()` 2362-2392, `startRevision()`
    2421-2455.
  - New-chat listener 758-793.
- `src/components/LineItemsEditor.tsx` (shared with
  `invoices/[id]/page.tsx:813`): rows keyed by index (`key={i}`, :133). Needs
  stable ids for add/remove motion.
- `src/lib/ai.ts:9` (`LineItem`), `src/lib/financials.ts:10-13`.
- Units would also touch:
  - `src/lib/pdf/templates/index.tsx:354, 582` and
    `src/app/pay/[token]/PayView.tsx:489-491`;
  - the parse route normaliser (`src/app/api/parse/route.ts` ~172-226) and
    duplicate math (~378);
  - `draftFingerprint` (chat :169);
  - the public RPC `get_public_invoice`
    (`supabase/migrations/20260926100000_pay_with_card_rpcs.sql:61-71`).
- Icons to add (font rebuild): `remove`, `backspace`, `north_east`, `person`.

### Behaviour (proposal; pixel spec waits on the release frames)
- **A template is a locally seeded draft, not a `/api/parse` call.** Same
  steps as `startRevision()`:
  - archive the current conversation;
  - **new `convoId`** (the `finalize_key`, one conversation = one row);
  - clear `pendingInvoiceRef` and link state, reset `originalDescriptionsRef`;
  - `intent = 'invoice' | 'quote'`, `intent_explicit = true`.

  Don't reuse `onit-new-chat` as is: it no-ops with only the greeting (761)
  and doesn't reset `voiceSession`, `prepState`, `shareWaiting` or
  `duplicateHint`.
- **`ready` only once Send is enabled** (a name plus at least one priced line).
  The pre-build inserts a row 400 ms after `ready`. Setting it early would
  burn invoice numbers and count toward the free 3-invoice cap.
- **"Send invoice ↗" calls `finalize()`.** That keeps:
  - the paywall gate and the `PAYWALL_LIMIT` hint;
  - the synchronous iOS share;
  - the client upsert, lock and history.

  Quotes stay uncapped.
- **Its own fixed layer above the tab bar** (the composer underneath is
  untouched). Qty and price are `readOnly` fields that open the custom keypad,
  so the OS keyboard never opens with it. `readOnly` doesn't count as text
  entry in `src/lib/keyboard.ts:44-49`. Name and Extra info are real inputs
  (OS keyboard, `data-kb-fit` on the layer).
- **Units:** an optional `unit` key in each `line_items` JSONB element
  ("5 materials × $2.00"). `qty` stays numeric. Shipped in its own commit after
  the template works without units.
- **Placeholder guide:** [Name, Product/Service, Price, Extra info]. Extra
  info = `draft.notes` (≤ 500 chars).

---

## 3. Nav: Clients · Invoices · Chat (center) · Books · Settings

### Files touched
- `src/app/(app)/layout.tsx`:
  - `TABS` 25-33.
  - `getParentRoute` 16-23.
  - Swipe 185-224 (index-generic; the comment at :216 assumes Chat is first).
  - Pill measurement 101-121 / 297-310 (measures each link, so 5 tabs work).
  - `BooksDot` 330-340.
- New `src/app/(app)/clients/page.tsx`. `src/app/api/checkout/route.ts:18`
  `RETURN_PATHS` gets `clients` if the paywall can open from Clients.
- Tutorial: `mocks.tsx:17-39`, `TutorialReference.tsx:19-25`, `slides.tsx`
  (`SlideTab`).
- Docs: ON-IT-DESIGN-STANDARD §4, MOTION-SPEC §10.
- Icons: `group` (Clients), `chat_bubble` (Chat, L7); `person`, `person_add` (M2).

### Design (M5)
- Bar 84 px. Pills 58×32; Chat 64×36, raised 4 px.
- Gold active disc, which slides with `left .34s spring`. Icon bounce 340 ms;
  screen `fadeUp .16s`.
- Chat keeps a soft #F0E3B8 pill when not active.

### Notes
- Every entry point still lands on `/chat` (unchanged).
- Swipes from Chat now go both ways.
- Five tabs may crowd at 375 px with today's `px-4` + 12 px labels.
- The pill currently animates `width`. Switch it to transform only.

---

## 4. Saved Clients, Products & Services, Recurring Expenses ("Pro" tag)

### Files touched
- `src/app/(app)/chat/page.tsx`:
  - Client lookup 961-974 — `.ilike('name', …)`, where an unescaped `%`/`_`
    acts as a wildcard; switch to the case-insensitive key.
  - Client upsert 1455-1464; `client_id` 1509.
  - Expense flow ~1945-2090.
- `src/app/(app)/dashboard/page.tsx:296-380` (Books add-expense sheet).
- New:
  - `clients` page with **Clients · Products & Services** segments (L14; the design puts Products inside
    Clients: "A–Z clients + items");
  - client detail;
  - Recurring Expenses list, reached from a row in Books next to Expenses
    (L14);
  - a shared `SaveToListPrompt` (M2/M3: dark card above the composer, no
    scrim).
- `src/app/api/followups/route.ts`: daily cron. Recurring becomes a step after
  recaps, production only, like the others.
- `src/lib/notify/{types,render,index}.ts`: new `recurring_skipped` event.
- `src/app/(app)/expenses/page.tsx`: the "Recurring" tag (select
  `recurring_id`).
- Pro tag: none exists (no badge component). It's a visual tag only for now;
  gating comes later.

### Save-to-list prompts
- **Clients.** At finalize, the silent upsert runs as today (history). If the
  client is unsaved (`saved_at is null`) and this is its **2nd use** (an
  earlier invoice or quote with the same `client_id`), show "Save {name} to
  your list?" after the share completes, never during the share gesture.
  - Save stamps `saved_at`.
  - Not now stamps `prompt_dismissed_at`, and that client isn't asked again.
- **Products & Services.** Each finalize records every line description in
  `products` (unsaved, `use_count + 1`). When an unsaved product reaches
  `use_count = 2`, show the prompt.
- **Recurring.** When a new expense matches an earlier one (same normalised
  vendor, same amount, about one cadence apart), M3's prompt appears: "Adobe
  charged $54.99 again. Make it a monthly recurring expense?". Accepting
  creates a `recurring_expenses` row.

### Recurring auto-log (locked rules, mechanics)
- **Due dates.** The cron step loads active, non-deleted items, plus each
  owner's `profiles.timezone`, via `resolveTimeZone` / `localYmd` (the same
  helpers as recaps, `src/lib/recap/dates.ts`). It logs every due date
  `next_on ≤ local today` (bounded catch-up, e.g. at most 3 per item per run).
- **Idempotent.** A unique index on `expenses (recurring_id, spent_on) where
  recurring_id is not null`; insert with `on conflict do nothing`. Two cron
  runs → one row. `next_on` advances by the cadence:
  - monthly is anchored to the item's day of month;
  - day 31 lands on the last day of a shorter month.
- **Never bypasses the cap.** The insert runs as the service role, and
  `enforce_free_expense_limit` (`SECURITY DEFINER` BEFORE INSERT trigger,
  `20261001000002_paywall_v2_expense_cap.sql:37,71`) still fires.
- **When the cap blocks it** (`hint = 'PAYWALL_LIMIT_EXPENSE'`):
  - record a skip on the item (`last_skipped_on`, `last_skip_reason =
    'free_limit'`);
  - advance `next_on` (no daily retry spam);
  - notify the user: push "Couldn't log Rent, free limit reached" via
    `notify()` (dedupe key `recurring_skipped:<item>:<due>`);
  - show the same message in-app: Recurring list row plus a Books banner, for
    users without push.
- **Pause / Delete.** Pause = `active = false` (resume restarts from the next
  due date; no back-fill). Delete = soft delete (`deleted_at`). Neither touches
  logged rows. A logged row is a normal expense: swipe-delete works as today
  (soft delete).
- **"Recurring" tag** on any expense row with `recurring_id`.

---

## 5. Invoice and expense sorting

### Files touched
- `src/app/(app)/invoices/page.tsx`:
  - Fetch `created_at desc limit 200` (63-68).
  - Sort 98-100 (tier 1 is a full timestamp, so A→Z never applies today).
  - `groupByPeriod(…, 'month')` 107; filter chips 157-161.
- `src/app/(app)/expenses/page.tsx`:
  - Sort 97-100.
  - Weekly groups with subtotals 102-105 and 163.
- `src/lib/date-groups.ts:50-67` (`groupByPeriod` keeps input order;
  subtotals are per group).

### Change (no DB)
- Group exactly as today (sorted newest first by date to build the groups).
  Then, when A–Z is on, sort **inside each group**:
  - invoices by `client_name`;
  - expenses by `vendor || description`;
  - case-insensitive `localeCompare(…, { sensitivity: 'base' })`, ties newest
    first.
- Group order, group labels and subtotals are unchanged.
- **Toggle:** a two-option segmented control ("Newest" | "A–Z") under the
  filter chips (invoices) or the header (expenses).
- **Persistence:** keys `onit-invoices-sort` / `onit-expenses-sort`,
  read/write in try/catch (the InstallBanner pattern). Default Newest.
- Books → Summary periods are untouched.

---

## 6. MOTION-SPEC §12 (first commit)

§12 describes `src/components/RecapSheet.tsx` ("sheet rises, figures count
up"), which was removed in `9eb43c0`. Rewrite it to point at today's code:
- the recap Watch/Later sheet (`RecapProvider.tsx`, `onit-sheet-in`);
- the story player (`src/components/recap/RecapStory.tsx` + `RECAP-SPEC.md`
  §2–§6);
- the history list.

Keep the PdfChoiceSheet `paywall-in` line.

---

## Data model — proposed migrations (NOT applied)

Process for each (CLAUDE.md):
1. dry run;
2. exact file list;
3. your "yes" in that conversation;
4. `db push`;
5. `npm run db:privcheck`.

Each adds SKIP-gated check rows in `supabase/snippets/privilege_check.sql`
(the P1/P2/P3 pattern), in the same commit. Names sort after
`20261002000001`. Every text column gets a CHECK cap (SECURITY.md:23). RLS +
owner policy in the same file (SECURITY.md:27).

### A. `…_clients_saved_list.sql`
- **Preflight** (read-only; run and **report** the result before the
  migration is pushed; no merging):
  ```sql
  select user_id, lower(btrim(name)) as name_key, count(*), array_agg(name order by created_at)
  from public.clients group by 1, 2 having count(*) > 1;
  ```
  If it returns rows, the case-insensitive unique index can't be built. You
  decide case by case; the migration doesn't merge anything.
- **Columns:**
  ```sql
  saved_at timestamptz,
  prompt_dismissed_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name_key text generated always as (lower(btrim(name))) stored
  ```
- **Key:** drop `unique (user_id, name)` and add `unique (user_id, name_key)`.
  The chat upsert targets `user_id,name_key` (verify the `ON CONFLICT` on the
  generated column on the local Postgres stub). The lookup matches `name_key`
  instead of `ilike`.
- **RLS:** split today's `FOR ALL` "own clients" into select/insert/update; no
  DELETE (soft delete). Matches invoices/expenses.
- **Grants:** `revoke all … from anon`; authenticated keeps
  select/insert/update; no TRUNCATE/REFERENCES/TRIGGER.
- **Privilege check rows (new section):**
  - RLS on;
  - exact policy set (no DELETE);
  - anon has nothing;
  - authenticated has no DELETE/TRUNCATE;
  - the unique index exists.

### B. `…_products_services.sql`
- **Table:**
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
- RLS owner select/insert/update; no DELETE.
- Grants and privilege-check rows from the start, as in A.
- `use_count` via an owner-scoped `security invoker` RPC
  `record_product_use(names text[])` (one call per finalize, atomic). Its
  check row: execute granted to authenticated only.

### C. `…_public_invoice_line_unit.sql`
- No table change: `unit` lives inside `invoices.line_items` JSONB.
- `create or replace function get_public_invoice(…)` to pass `'unit'` through,
  with the same signature and grants. It's the public pay-page RPC, so
  security-relevant: the existing H-section check rows must still PASS.

### D. `…_recurring_expenses.sql`
- **Table:**
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
    anchor_day smallint check (anchor_day between 1 and 31),
    next_on date not null,
    active boolean not null default true,          -- Pause / Resume
    saved_at timestamptz,
    prompt_dismissed_at timestamptz,
    last_logged_on date,
    last_skipped_on date,
    last_skip_reason text check (last_skip_reason is null or last_skip_reason in ('free_limit','error')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
  );
  ```
- **On `expenses`:**
  `add column recurring_id uuid references public.recurring_expenses(id) on delete set null`
  plus `create unique index … on public.expenses (recurring_id, spent_on) where
  recurring_id is not null`. That index gives the cron its idempotency.
- **Client privileges:**
  - Clients may update only `vendor, description, amount, category, cadence,
    anchor_day, active, saved_at, prompt_dismissed_at, deleted_at,
    updated_at`.
  - `next_on`, `last_*` and `recurring_id` on expenses are written only by the
    service-role cron.
  - Column grants, as recaps does.
- **`notification_log_type_chk`** gains `recurring_skipped` (drop + add, as
  `20261001000010_recaps.sql:81-82` did). Without it, the push claim fails.
- Privilege-check rows from the start: RLS, policies, column grants, no
  DELETE, the unique index, and the extended type check.

### E. (later) Pro gating
Not proposed. "Pro" = the existing paid plan, visual tag only for now (L9).

---

## Conflicts re-checked

Each item was checked against the composer lock, the paywall caps, recaps, the
chat AI flow and keyboard handling. Files read for this check:
- `src/app/(app)/chat/page.tsx`
- `src/app/(app)/layout.tsx`
- `src/lib/keyboard.ts`
- `src/components/Splash.tsx`, `src/components/MicRings.tsx`
- `src/lib/access.ts`, `src/lib/paywall.ts`
- `supabase/migrations/20261001000001_paywall_v2_invoice_cap.sql`,
  `supabase/migrations/20261001000002_paywall_v2_expense_cap.sql`
- `src/lib/notify/recaps.ts`, `src/lib/recap/payload.ts`
- `src/app/api/followups/route.ts`
- `src/lib/notify/index.ts`, `src/lib/notify/types.ts`
- `supabase/migrations/20261001000010_recaps.sql`
- `src/app/(app)/invoices/page.tsx`, `src/app/(app)/expenses/page.tsx`
- `src/lib/date-groups.ts`
- `src/app/(app)/summary/page.tsx`
- `src/components/LineItemsEditor.tsx`
- `supabase/migrations/001_init.sql`

| Item | Composer lock | Paywall caps | Recaps | Chat AI flow | Keyboard |
|---|---|---|---|---|---|
| **Composer + expand** | Only the icon and the tap handler change. Circle size/colour/position, `data-splash-target` (chat:2887, Splash.tsx:103), MicRings wrapper (chat:2881), camera/gallery/field/send all untouched. Mic calls the existing `micTap()` in the same tap. ✔ | Menu options open existing flows; no cap logic touched. ✔ | No effect. ✔ | Mic path identical (`micTap` → `startRecording` → `/api/transcribe` → `send(text,'voice')`). ✔ | The menu opens no input. `data-no-tab-swipe`; z-index below PaywallModal/UndoToast. ✔ |
| **Guided template** | Separate layer; the bar stays as is under it (template grow motion borrowed, field morph not adopted). ✔ | Send goes through `finalize()`, so the invoice gate (chat:1411-1426), trigger hint (1534) and quote exemption are kept. `ready` only once complete, so no early pre-build rows (1320-1330) and no wasted cap slots. ✔ | Template invoices are ordinary invoice rows; recaps read them as today. ✔ | Bypasses `/api/parse` on purpose. New `convoId`/`finalize_key` per template (as `startRevision`), so no cross-conversation row updates. The duplicate warning needs a client-side or at-Send check (open item). ⚠ handled in the commit | Qty/price are `readOnly` keypad fields (not text entry, keyboard.ts:44-49); Name/Extra info use the OS keyboard with `data-kb-fit` on the layer; never both open. ✔ |
| **5-tab nav** | Not touched. ✔ | `RETURN_PATHS` gains `clients` only if the paywall opens there. ✔ | `BooksDot` moves with the Books tab (layout:319). ✔ | Landing stays `/chat`; `/chat?new=1` unchanged. ✔ | Nav keeps `data-kb-hide` (layout:297). ✔ |
| **Clients (saved + prompt)** | Prompt is an inline card above the bar, not part of it. ✔ | Clients rows aren't capped. The upsert still runs before the invoice insert (chat:1455), so a capped free user keeps a history row (harmless, as today). ✔ | Recaps read `invoices.client_name`, never `clients` (recaps.ts:148-244), so no change. ✔ | Lookup moves from `ilike` (wildcard bug) to `name_key`; autofill behaviour otherwise the same. The prompt shows after the share completes, never inside the share gesture. ✔ | Card has no input; Save/Not now buttons only. ✔ |
| **Products & Services** | ✔ | Not capped. ✔ | Not read by recaps. ✔ | `record_product_use` runs after a successful finalize (fire-and-forget), so it never blocks or alters the send. ✔ | ✔ |
| **Recurring auto-log** | ✔ | Inserts as the service role, and the cap trigger still fires (SECURITY DEFINER, expense_cap.sql:37,71). On `PAYWALL_LIMIT_EXPENSE`: skip + notify, never bypass. ✔ | Auto-logged rows are real expenses, so they count in Books and recaps (intended). Built snapshots never change (insert-once, recaps.ts). Cron order: recurring **before** recaps, so a Monday's logged rent is in that week's recap. ✔ | Not involved. The chat expense flow only gets the "make it recurring?" prompt after a save. ✔ | Recurring form uses normal inputs inside existing sheet patterns. ✔ |
| **Sorting toggle** | ✔ | ✔ | ✔ | ✔ | Segmented control has no input. ✔ |
| **MOTION-SPEC §12 fix** | Doc only. ✔ | ✔ | ✔ | ✔ | ✔ |

---

## Motion inventory

The design's inventory vs MOTION-SPEC (§1–11 shipped; §12 fixed in commit 1).

| Screen / action | Design (on-it-motion.html) | MOTION-SPEC today | Status |
|---|---|---|---|
| Composer + open / close | + → ×, options rise on a 12° arc, 45 ms stagger, cream scrim, 300 ms spring / reverse 180 ms exit | — | **Adopt** (new §) |
| Template opens | slots stagger 30 ms, rise 6 px, 360 ms (as its own layer, not a field morph) | §3 card build-in (chat card) | **Adopt** |
| Slot filled | dashed → solid chip, 1.04 pop, 320 ms spring | — | Adopt |
| Pick from sheet | sheet down, text hands off into the slot, 340 ms | — | Adopt |
| Qty − / + | number rolls, totals odometer, 140 ms, tick | §9 roll (Books only) | Adopt |
| Keypad | sheet rises 320 ms, live line total | — | Adopt |
| Add / remove item | expand 380 ms / collapse 320 ms + 5 s undo | — | Adopt (stable row ids) |
| Send enabled | gold sweep then ↗ pops, 400 ms | §3 send fades in last | Adopt |
| Send invoice / quote | M1 hero, 1,100 ms (template card folds; the bar stays) | §4 lock on send (kept) | Deferred to commit 17 (L11) |
| Save client / item | M2: chip arcs into the Clients tab, tab bumps, "+1", bubble; 1,000 ms | — | Adopt |
| Save prompt | rises 14 px spring 320 ms; Not now sinks 10 px 180 ms | — | Adopt |
| Make recurring | M3: ellipse draws, "Monthly" pops, ↻ spins, shimmer; 950 ms | — | Adopt |
| Recurring auto-logged | shimmer + "Logged automatically", 900 ms | — | Adopt (+ "Recurring" tag) |
| Recurring skipped | — | — | New: banner rises 240 ms (§1 rise) |
| Marked paid | M4 stamp + tiles count up, 1,200 ms | §6 gold sweep (kept) | Deferred to commit 17 (L11) |
| Tab switch | M5 disc slide 340 ms spring, icon bounce, fadeUp 160 ms | §10 pill 300 ms + side entry | Update §10 |
| Invoices filter | list crossfade 12 px shift, 200 ms | §10 ring | Adopt |
| Sort toggle | segment thumb slides 180 ms spring | — | Adopt (Forms segment row) |
| New entry in list | slides into A–Z slot + gold glow 1.2 s | — | Adopt |
| Swipe delete / undo | resistance past 40 %, 300 ms / undo 300 ms spring | SwipeableRow 200 ms (not in spec) | Adopt |
| Long-press / search / A–Z letter | 220 ms / 160 ms / 300 ms + pulse | — | Later (no such UI yet) |
| Client detail | shared avatar/name, stats count up, 380 ms | — | Adopt |
| Form save | label → ✓, sheet down, 400 ms | — | Adopt |
| Chat new message | typing dots, bubble rises 8 px, 240 ms | §2 (not built) | Build |
| Receipt snapped | thumbnail into a bubble, scan line, 600 ms | §8 shutter | Update §8 |
| Failed action | shake 6 px × 3, inline Retry, 360 ms | §7 shake 320 ms | Update §7 |
| Books recaps dot | ring pulse once 600 ms | — | Adopt |
| Empty states, sheets (generic), toasts | — | inconsistent / none | One rule each |
| Settings toggles | — | animate `left` | Fix (transform) |

### Reduced motion
- Design: every row becomes a crossfade ≤ 200 ms; numbers swap without
  rolling.
- Repo: a global CSS kill switch (`globals.css:468-478`) plus per-component
  checks. WAAPI animations branch themselves.
- Move the duplicated `usePrefersReducedMotion` (PaywallSlideshow,
  RecapStory) to `src/lib` in the motion-foundations commit.

### Haptics
iOS Safari/PWA has no vibration API, so haptics work on Android only (accepted, L12).

---

## Commit sequence (one item per commit, safe order)

**DB commits** contain the migration file plus its privilege-check rows only.
You apply each with the CLAUDE.md flow **before** the code that needs it
merges.

**Code commits:** typecheck + `npm test` + build, then an iPhone check on the
branch preview.

| # | Commit | DB? | Risk |
|---|---|---|---|
| 1 | **MOTION-SPEC §12 fix** (doc) + motion foundations: shared reduced-motion hook, sheet/toast rules, toggle fix | — | Low |
| 2 | Invoice sort toggle (Newest / A–Z within month, per-device) | — | Low |
| 3 | Expense sort toggle (A→Z inside each weekly group; subtotals and Summary untouched) | — | Low |
| 4 | Composer: gold mic → gold "+" expand (Mic · New invoice · New quote). Mic = `micTap()`; New invoice/quote stub to today's chat greeting until #8. Tutorial copy | — | Medium (iOS gesture) |
| 5 | Nav → 5 tabs (Clients placeholder with the Clients · Products & Services segments), `group` + `chat_bubble` icons, raised centre Chat pill (M5), tutorial mocks | — | Medium |
| 6 | Migration A (clients) — **preflight duplicate report first** | **yes** | Medium |
| 7 | Clients list + detail + "Save to your list?" (M2) | needs 6 | Medium |
| 8 | Guided template without units — **waits for the release frames**. Tap-to-fill form; locked composer under it; Send via `finalize()`. **The 48-hour duplicate-invoice check moves to Send as one shared check for chat and template invoices** (out of `/api/parse` ~378) | — | **High** |
| 9 | Migration C (public RPC passes `unit`) | **yes** | Medium |
| 10 | Units end to end (editor, PDF, PayView, parse normaliser + AI rule) | needs 9 | Medium |
| 11 | Migration B (products + `record_product_use`) | **yes** | Low |
| 12 | Products & Services segment + save prompt + pick-from-sheet | needs 11 | Medium |
| 13 | Migration D (recurring + `expenses.recurring_id` + notification type) | **yes** | Medium |
| 14 | Recurring Expenses row in Books (next to Expenses) + list with Pause/Delete, save prompt (M3), "Recurring" tag | needs 13 | Medium |
| 15 | Recurring cron step (idempotent, timezone, back-fill ≤ 3 each cap-checked, cap skip + notify) | needs 13 | **High** |
| 16 | "Pro" tags (visual) | — | Low |
| 17 | Final motion pass (M1 send and M4 paid, deferred per L11; list rows; empty states) | — | Medium |

**Why this order:**
- Doc and sorting first (no risk).
- Composer before the template it opens.
- Each table lands before its UI.
- Units after the template works.
- The recurring cron last: it is the only scheduled writer, and it touches
  caps and recaps.

---

## Open questions

None. All answered 2026-10-03 and locked in §L (items 7–17).
