# On It — UI redesign audit, rev 2 (feat/ui-redesign)

Audit only. No app code changed in this revision, and no migration was written
or applied. Rev 1 (`5ea7a2a` → `ddaf491`) is replaced by this file. Written
2026-10-03.

**Branch state when written:**
- `main` 683301b, then the rev 1 audit, then commits 1–5 (`c99ce2d` motion
  foundations, `16bf943` invoice sort, `da98c8c` expense sort, `b7d488d`
  composer "+", `91f6c09` 5-tab nav).
- `66bb0be`: the release frames (`design-reference/on-it-next-release.html`).
- `b5c261d`: **`feat/receipt-motion` merged** in its own merge commit, before
  any composer work (§9 lists its conflicts and how they were resolved).

**Design sources** (both are Claude Design "bundled page" exports; unpacked
the same way: the `__bundler/manifest` entries are base64 + gzip, and
`__bundler/template` is the canvas):
- `design-reference/on-it-next-release.html` ("the release frames"). It holds
  the canvas (sections 0–7) plus two live components: `Composer Prototype.dc.html`
  (17 presets) and `Tab Bar.dc.html`. All frames are 393×852. The names and
  contact details in them are mock data.
- `design-reference/on-it-motion.html` ("the motion file"). It holds M1–M5
  and the 37-row motion inventory.

Frame ids below (`1b`, `3c` …) are the release frames' own labels.

---

## F. Founder rules for this pass (2026-10-03)

1. **Build everything** in both files: every screen, button and function, all
   working. Nothing ships as a dead button. When something needs a table, an
   RPC or a cron, that work is in the sequence; nothing is stubbed in the UI.
2. **Never lose an existing feature.** §2 lists, per screen, what exists today
   that the design doesn't show, and where it goes. Nothing is removed without
   the founder's yes.
3. **Nav:** the 5-tab design (Clients · Invoices · Chat · Books · Settings).
   Settings uses the grouped screen (`0c`). Its Clients and Products rows link
   to the Clients tab.
4. **Voice:** the Voice option calls `micTap()` synchronously in the tap.
   During a session there is a stop/send control and an end-session ×.
   `data-splash-target` moves to the new +.
5. **Motion:** where the design's motion spec (`1d`) gives exact values for the
   composer, menu or template, use them. Everywhere else, use MOTION-SPEC tokens.
6. **Pro:** a visual tag plus the design's copy ("PRO is part of an upcoming
   plan. It's included free for now."). The free caps (3 invoices / 5 expenses)
   still apply everywhere, including auto-logged recurring expenses.
7. **Data model:** plan the additions (link past invoices to a newly saved
   client, product usage counts, repeat-expense detection, the recurring "Log
   automatically" switch). Propose the migrations only; never apply them.
8. `feat/receipt-motion` is merged first, in its own merge commit. Done
   (`b5c261d`, §9).

**The composer lock is lifted.** We adopt the design's composer: a small +
on the left, a "Message On It…" field with gallery and camera inside it, and
send on the right. The + menu offers Voice / New invoice / New quote, with
subtitles. Picking invoice or quote turns the bar into the template card in
place.

**One change from the design:** the template's send control is a **black
circle with a ↗ arrow only**. There is no gold "Send invoice" pill and no text.
- `aria-label="Send invoice"` / `"Send quote"`.
- Clearly disabled until there's a client and an item.

---

## L. Locked decisions (rev 1) — what stands, what changed

| # | Decision | Rev 2 |
|---|---|---|
| L-lock | Composer locked to today's bar; only the mic → + swap | **Changed (F):** the lock is lifted; the design's composer is adopted |
| L1 | Invoices: Newest / A–Z toggle, A–Z by client within each month, remembered per device | Stands (built, commit 2). The design's "A–Z by client" label becomes the toggle's caption |
| L2 | Expenses: keep the weekly/monthly views and subtotals; only order inside groups changes | **Changed (Q2, locked 2026-10-03):** the expenses list gets a **Week / Month** group switch (Week by default, remembered per device). Each view shows its own group subtotals; Newest / A–Z sorts inside whichever grouping is active. The Books "View expenses" subtitle matches the active grouping ("A–Z by vendor, by week" / "…by month"; "Newest first, by …" when sorted newest) |
| L3 | Recurring auto-log: real expenses, "Recurring" tag, Pause + Delete, cap never bypassed (skip + notify), daily cron, idempotent, user timezone | Stands. **Mapping to the design:** Pause = the "Log automatically" switch off (`3i`); Delete = "Stop & delete"; the "Recurring" tag = the ↻ icon on the row (`4b`). See Q8 |
| L4 | Clients: silent upsert kept as history; "saved" flag; prompt on 2nd use; case-insensitive key (report duplicates, don't merge); privilege-check rows. Products and Recurring get the same prompt | Stands. **The design adds:** "Not now ends it until the next repeat" (it asks again on the next use), and linking past invoices on save (`3c`). See Q7 |
| L5 | "View expenses" already on `main` | Stands |
| L6 | MOTION-SPEC §12 fixed in commit 1 | Done (`c99ce2d`) |
| L7 | Chat tab icon `chat_bubble`, raised centre pill | Stands (built, commit 5) |
| L8 | Templates follow the same guest rules as chat | Stands |
| L9 | "Pro" = the existing paid plan, visual tag only | **Changed (F6):** "Pro" is a feature tag on Recurring with the design's copy. It is shown to everyone and usable by everyone. It is not the paid plan, so the Plan row shows Free / Trial / Subscribed / Founder, never "Pro" |
| L10 | Keep MOTION-SPEC easing; design curves not adopted | **Changed (F5):** `1d`'s exact values are used for the composer, menu and template. MOTION-SPEC tokens everywhere else |
| L11 | Keep lock-on-send (§4) and gold-sweep paid (§6); M1/M4 deferred to a final motion pass | **Changed (F1):** M1 and M4 are in scope. M1 ships with the template (merge 2). M4 ships in merge 1. The shipped §4/§6 code is replaced, not stacked |
| L12 | Haptics Android-only | Stands |
| L13 | The template is a tap-to-fill form; no voice/typing fills it; Voice → chat | Stands. The design matches: slots open sheets. Extra info is a free-text note |
| L14 | Recurring is a row in Books; Clients tab = Clients · Products & Services | Stands. The design matches (`0a`, `5a`) |
| L15 | Missed due dates: back-fill ≤ 3, each cap-checked; resume never back-fills | Stands |
| L16 | Release frames coming; template waits | **Done:** the frames arrived (`66bb0be`) |
| L17 | The 48-hour duplicate check moves to Send, shared by chat and template | Stands |

**Locked 2026-10-03 (rev 2 answers):**

| # | Decision |
|---|---|
| Q1 | Until the template lands (merge 2), **New invoice / New quote** start a fresh chat seeded "Invoice for " / "Quote for " and focused, subtitle **"Say or type it"**. Merge 2 switches them to the template and the subtitle to "Guided template" |
| Q2 | Expenses: **Week / Month** group switch, Week default, remembered per device; per-view subtotals; sort inside the active grouping; Books subtitle follows the active grouping (see L2) |
| Q3 | Template Send needs a client, ≥ 1 named item **and a price on every named item**; the hint names the missing price ("Add a price for Labor") |
| Q4 | The Books button keeps the label **"Income & Expenses"** |
| Q5 | Recurring uses the existing 10 expense categories (Software → Subscriptions, Equipment → Tools, Materials → Supplies, Storage → Other). No new categories |
| Q6 | Deleting a client = un-save + clear phone / email / address / notes, 5 s undo; invoices and the history row stay |
| Q7 | Save prompts: **"Not now"** closes this one; it asks again on the next repeat |
| Q8 | Recurring **"Log automatically"** off = Pause (L3); **"Stop & delete"** = Delete |
| Q9 | Help & feedback › **Contact us** opens `mailto:brandon@dynastyweb.co` |
| Q10 | Chat greeting: time of day, no name ("Morning! Snap a receipt, or tap + to start an invoice or quote."); no new `profiles` column |

---

## 1. Screen-by-screen inventory

**Status key:**
- **Built** = on this branch and matching the frames.
- **Partial** = on the branch but differs from the frames (the difference is noted).
- **New** = nothing yet, no DB needed.
- **New · DB x** = needs migration x (§3) first.

`chat` = `src/app/(app)/chat/page.tsx`.

### 1.1 Chat composer: idle bar (`1a`, Composer Prototype `idle`)

| Control | What it does | Backend | Status today |
|---|---|---|---|
| **+** (44 px circle, `#F0E3B8`, `add` 28 px, `aria-label="More"`) | Opens / closes the + menu. Open: icon turns 45° to ×, fill flips to ink `#2E2822`, glyph cream. Carries `data-splash-target` (F4) | none | **Partial.** Commit 4's + is today's 72 px gold circle (`h-fab`) with `data-splash-target`. Rebuilt at 44 px |
| **"Message On It…" field** (44 px, radius 22, `#FFFDF8`, border `#E3D8C3`) | Typed message → `send(text)` → `/api/parse` (unchanged pipeline). Enter sends | existing `/api/parse` | **Partial.** Today's textarea "Or type it…". Restyled; keeps multi-line growth (`max-h-32`) and Enter / Shift+Enter |
| **Gallery** (`image`, inside the field, right) | Opens the photo picker → `onPickReceipt` (receipt read + ReceiptBubble flight, §8) | existing `/api/parse-receipt` | **Partial.** Exists as a separate stacked button left of the circle. Moves inside the field |
| **Camera** (`photo_camera` on a `#F0E3B8` 36 px circle, inside the field) | Rear camera (`capture="environment"`) → `onPickReceipt` | existing | **Partial.** Same as gallery: moves inside the field |
| **Send** (44 px, `arrow_upward`) | Sends the typed text. Ink circle when there is text; muted `#EAE2D2` / `#B0A592` and `disabled` when empty or `phase !== null` | existing | **Partial.** Today a 56 px ink circle with `send`. Restyled |

### 1.2 + menu (`1b`, `1c`, `1d`)

| Control | What it does | Backend | Status today |
|---|---|---|---|
| Scrim (`rgba(252,247,239,.86)`, "cream frost"; the bar stays sharp) | Tap closes the menu | none | **Partial.** `ComposerMenu` scrim exists; restyled to `1d` (220 ms ease) |
| **Voice** · "Say it, On It writes it" (`mic`, `#F0E3B8` disc) | Calls `micTap()` **synchronously inside the tap** (F4), then closes the menu. Starts today's voice session (§1.3) | existing `/api/transcribe`, TTS | **Partial.** Exists as "Mic" with no subtitle. Relabelled, plus subtitle |
| **New invoice** · "Guided template" (`description`, gold `#D4AF37` disc) | Closes the menu, then the field becomes the template card in place, in invoice mode (§1.4) | template (merge 2) | **Partial.** Today it seeds "Invoice for " in chat. See Q1 for merge 1 |
| **New quote** · "Guided template" (`request_quote`, `#F0E3B8` disc) | Same, in quote mode | template (merge 2) | **Partial.** As above |
| Close (×, scrim, Escape, pick) | Everything reverses together, no stagger | none | **Built.** Retimed to `1d` |

Option buttons are 56 px tall, radius 28, `#FFFDF8`, border `#E6DCC8`, with a
40 px icon disc, a 16 px title and a 12.5 px subtitle. They are left-aligned
above the +, with transform origin `22px 100%`.

### 1.3 Voice session (F4; the design shows only "Listening… / Done")

| Control | What it does | Backend | Status today |
|---|---|---|---|
| In-field **"● Listening…"** (red `#C8452C` dot) + **Done** (ink pill, `aria-label="Stop and send"`) | While recording: Done → `micTap()` → stop → transcribe → `send(text,'voice')` | existing | **New UI.** Today it's the 72 px circle + "Listening… tap the mic when you're done" |
| In-field **Speak** pill (`aria-label="Speak"`) | Session on, between takes: starts the next take (`micTap()`). Disabled while `phase !== null` (thinking / speaking the reply) | existing | **New UI.** Today the circle does this |
| **×** in the + slot (ink, `aria-label="End voice session"`) | `endVoiceSession()`: stops TTS and recording, releases the mic stream. The bar returns to idle | existing | **Partial.** Today a separate × button left of the circle |
| Level indicator | MicRings reads the stream. Target moves from the 72 px circle to the in-field dot (the dot scales with level, ≤ 14 px, one ring) | none | **Partial.** MicRings is built for the 72 px circle; MOTION-SPEC §11 gets updated |

Camera and gallery stay hidden during a session (as today and as the design).
Send stays visible but disabled (no text).

### 1.4 Template card (`1e`–`1j`, `7a`–`7e`, Composer Prototype)

It replaces the bar in place: the bar's slot becomes the card, the tab bar
stays, and the chat above stays scrollable. It is its own state of the
composer, not a modal.

| Control | What it does | Backend | Status today |
|---|---|---|---|
| Header chip "NEW INVOICE" / "NEW QUOTE" | Shows the mode | none | **New** |
| **"Make it a quote" / "Make it an invoice"** | Switches the mode, keeping all slots | none | **New** |
| **Close ×** (32 px, `aria-label="Close template"`) | Back to the idle bar. Discards the unsent template; no row was written (see "ready" below) | none | **New** |
| **Name slot** (dashed "Name" → solid ink chip with `person` + `unfold_more`) | Opens the Client sheet | DB A | **New · DB A** |
| Client sheet: search ("Search N clients"), **USED BEFORE · NOT SAVED** group ("Used once · Sep 18"), A–Z groups + scrub rail, **"Use '{q}'"** row, **+ New client** | Picks a saved client, an unsaved history client, or a new name. "+ New client" with no query focuses search; with a query it uses it | DB A (`clients.saved_at`, `client_summaries()`) | **New · DB A** |
| **Item row**, a two-row card: name chip with unit ("Deck staining · job") / dashed "Product/Service" | Opens the Item sheet for that row | DB B | **New · DB B** |
| Item sheet: search ("Search N items"), USED BEFORE · NOT SAVED with last price, A–Z + rail, prices ("$3.25/sq ft", "No price"), Use '{q}', + New product or service | Pick fills name, unit and price; qty resets to 1 | DB B (`products`) | **New · DB B** |
| **Qty stepper** − / number / + (qty 1 muted `#A39883`) | ± 1, minimum 1. Unit label "hr" / "sq ft" after it | none | **New** |
| **Qty number** → Quantity keypad ("Quantity of X", "× $1.50 = $180.00", keys 1–9 . 0 ⌫, Set quantity) | Decimal qty, ≤ 2 dp, ≤ 7 digits; 0 or empty → 1 | none | **New** |
| **Price chip** / dashed "$ Price" → Price keypad ("Price for X", "per hour", Set price) | Sets `unit_price` | none | **New** |
| Line total (right, Montserrat 16) | qty × price; muted until named and priced | none | **New** |
| **Remove item** (`delete`, only when > 1 row) | Collapses the row, with a 5 s undo bar | none | **New** |
| **+ Add item** | Appends an empty row, scrolls the list to it | none | **New** |
| Item list area | Scrolls inside a capped area (`max-height` 196 px in the prototype; "~50%" in the copy) with 14 px mask fades. The Name row is pinned above and the totals pinned below | none | **New** |
| **Extra info slot** ("Extra info · dates, notes, deposit") → sheet: textarea ("Due Friday, job address, notes for the client…") + chips **Due Friday · Due in 14 days · 50% deposit · Job at {address}** + Done | Free text → `draft.notes` (≤ 500). Parsed deterministically on the device (no AI): "N% deposit" → `deposit_type='percent'`, `deposit_value=N`; "Due {weekday}" / "Due in N days" → `due_date`. The address chip only appears when the picked client has an address on file | existing deposit/due columns | **New** |
| Footer: hint ("Add a client and an item to send" / "Add a client to send" / "Add an item to send") or Subtotal · "50% deposit due now: $X" · **Total** | Live totals | none | **New** |
| **Send ↗** (founder change): black `#2E2822` circle, cream `north_east`, no text. `aria-label="Send invoice"` / `"Send quote"` | Enabled only with a client and ≥ 1 named item (and see Q3 on prices). Disabled: `disabled` + `aria-disabled`, `#EFE7D8` fill, arrow at 40 % ink, no press scale. Tap → **`finalize()`**: paywall gate (3-invoice cap; quotes uncapped), the shared 48 h duplicate check (L17), client upsert, PDF, the synchronous iOS share | existing finalize | **New** |

**Template rules** (rev 1, unchanged):
- A template is a locally seeded draft: a new `convoId` / `finalize_key`,
  `intent_explicit = true`, no `/api/parse` call.
- `ready` is set only once Send is enabled. The pre-build inserts a row
  400 ms after `ready`, so setting it earlier would burn invoice numbers and
  free-cap slots.
- Name and item sheets have real inputs (search). Qty and price use the custom
  keypad, never the OS keyboard.
- Tax: the frames show none ("show tax as a line" is only a "Try next"), so
  template documents go out at `tax_rate 0`. Chat-made documents are unchanged.

**After Send** (M1): the card folds into the chat, and a **sent-doc card** is
added to the thread (name, SENT chip, "Invoice INV-0042 • date", amount; tap →
`/invoices/[id]`). The user-turn summary bubble ("Invoice Mike Davis: Deck
staining $450.00 …") is added too, as a real message, so history and recaps
read the same as a chat-made invoice. **Status: New.**

### 1.5 Save prompts (`2a`–`2c`)

A dark card (`#2E2822`) floats above the composer with no scrim, so typing,
+ and the camera keep working. It appears about 700 ms after the send or the
logged receipt. One prompt shows at a time; extra prompts wait in a queue.

| Prompt | Buttons → effect | Backend | Status |
|---|---|---|---|
| `person_add` "Save **Mike Davis** to your clients?" | **Save** → `save_client` (stamps `saved_at`, links past invoices); bot "Saved Mike Davis to Clients."; M2 flight into the Clients tab. **Not now** → closes; asks again on the next use (Q7) | DB A | **New · DB A** |
| `sell` "Save **Deck staining** ($450.00) to your products & services?" | **Save** → `saved_at` (price/unit = last used); bot "Saved … to Products & Services."; M2 flight (Clients tab, Products segment). **Not now** as above | DB B | **New · DB B** |
| `autorenew` "**Adobe** charged $54.99 again. Make it a monthly recurring expense?" | **Make recurring** → creates `recurring_expenses` (cadence from the detected gap, `next_on` = last + cadence, `auto_log` on); bot "Done. Adobe is now a monthly recurring expense. I'll log $54.99 on Nov 2."; M3. **Not now** as above | DB D | **New · DB D** |

**Triggers:**
- **Client:** at finalize, if the client is unsaved and this is its ≥ 2nd
  document. The count comes from the `save_client` / `client_summaries` data,
  not from client state.
- **Product:** `record_product_use()` returns the names that are unsaved with
  `use_count ≥ 2`.
- **Recurring:** after any expense save (chat, receipt, Books sheet): same
  normalised vendor, amount within ±10 %, and a gap of about one cadence
  (weekly 5–9 d, monthly 26–35 d, yearly 350–380 d) from an earlier expense,
  with no live recurring item for that vendor (`repeat_candidate()`, DB D).

The prompt shows only after the share completes, never inside the share
gesture. Guests get no prompts (they have no rows).

### 1.6 Navigation + header (`0a`, Tab Bar)

| Control | What it does | Backend | Status today |
|---|---|---|---|
| Tabs **Clients · Invoices · Chat · Books · Settings** (84 px bar; pills 58×32; Chat 64×36 raised 4 px with a soft `#F0E3B8` fill when inactive; active = gold `#D4AF37` disc, filled icon, 700 weight; labels 11.5 px) | Navigate; swipes as today | none | **Built** (commit 5). Check against the frames: Chat pill 60 px today vs 64 px |
| Books tab **unread dot** (`#C8452C`, 9 px) | Unwatched recap (RECAPS_LIVE) | existing | **Built** (`BooksDot`) |
| Tab switch: disc slides, icon bounces 4 px, screen crossfades 160 ms, Chat press .9 scale + 1 px down (M5) | Motion only | none | **Partial.** Today the pill glides 300 ms with a side entry. Moves to M5 using tokens (§4) |
| Header: "On It." wordmark + **How On It works** pill | Opens `TutorialReference` | none | **Built** |

### 1.7 Clients tab · Clients segment (`3a`, `3d`)

| Control | What it does | Backend | Status today |
|---|---|---|---|
| Segments **Clients · Products & Services** | Switch segment | none | **Built** (placeholder, commit 5) |
| **Search** ("Search 18 clients") | Filters live; empty letter headers collapse; "No clients match '{q}'" | none (client-side over the loaded list) | **New** |
| **+** (gold) | Opens New client (`3c`) | DB A | **New · DB A** |
| Row: initials avatar, name, status line ("Paid up" / "1 open · $310.00" / "1 overdue · $2,150.00" in red / "1 quote out"), chevron | Tap → client detail | DB A `client_summaries()` | **New · DB A** |
| A–Z letter headers + **scrub rail** (letters with rows gold `#8C6D10`, others `#D6CCB8`) | Tap or drag a letter → scroll to it, header pulses | none | **New** |
| **Swipe left → Edit / Delete** | Edit → `3c` prefilled. Delete → un-save (Q6) + 5 s undo | DB A | **New · DB A** |
| **Long-press** → Edit / Delete menu | Same actions | DB A | **New · DB A** |
| Empty state ("No clients yet … On It will also offer to save anyone you bill twice." + **Add client**) | Add → `3c` | DB A | **Partial** (placeholder copy, no button) |

### 1.8 Client detail (`3b`)

| Control | What it does | Backend | Status today |
|---|---|---|---|
| ‹ Clients · **Edit** | Back; Edit → `3c` | DB A | **New · DB A** |
| Avatar, name, "Client since Jun 2026" (`clients.created_at`, the first time they were billed) | — | DB A | **New · DB A** |
| **Call / Text / Email** | `tel:` / `sms:` / `mailto:` with the stored value. When the value is missing, the tap opens Edit with that field focused (never dead) | none | **New** |
| **Invoice** (gold) | Opens Chat with the template in invoice mode and the Name slot filled | template | **New** (merge 2) |
| Tiles **Total paid** / **Still owed** (count up once) | Sum of payments / balance due over this client's documents | DB A `client_summaries()` | **New · DB A** |
| Info rows: phone, email, address, **notes** | Tap → Edit | DB A (`clients.notes` is new) | **New · DB A** |
| **Invoices & quotes** list (number, "Oct 1, 2026 · Fence repair", amount, DUE / PAID / CONVERTED / OVERDUE chip) | Tap → `/invoices/[id]` | existing invoices by `client_id` | **New** |

### 1.9 New / Edit client (`3c`)

| Control | What it does | Backend | Status |
|---|---|---|---|
| Cancel / **Save** | Save → `save_client(name, phone, email, address, notes)`: upsert on `name_key`, stamps `saved_at`, **links past invoices** (§3 A), returns the linked count. Label → ✓, sheet down, row glows | DB A | **New · DB A** |
| Name, Phone, Email, Address, Notes ("Gate code, preferred contact time…") | Inputs with the SQL length caps | DB A | **New · DB A** |
| History note: "**Mike is on 2 invoices already. Both will link to this client.**" | Shown when the typed name matches existing documents (`client_name_usage(name)`) | DB A | **New · DB A** |

### 1.10 Products & Services segment (`3e`, `3g`)

| Control | What it does | Backend | Status |
|---|---|---|---|
| Search ("Search 12 items"), **+**, A–Z + rail | As for Clients | DB B | **New · DB B** |
| Row: name, "description · per unit", price ("$450.00", "$3.25/sq ft", "No price" muted) | Tap → Edit (`3f`) | DB B | **New · DB B** |
| **Long-press** menu (row lifts, list dims): **Edit · Duplicate · Delete** | Duplicate → "{name} (copy)", saved. Delete → soft delete + undo | DB B | **New · DB B** |
| Swipe left → Edit / Delete | Same | DB B | **New · DB B** |
| Empty ("Nothing saved yet … Picking one in an invoice fills in the price." + **Add product or service**) | → `3f` (new) | DB B | **Partial** (placeholder) |

### 1.11 Edit product / service (`3f`)

| Control | What it does | Backend | Status |
|---|---|---|---|
| Cancel / Save | Saves `name, unit_price, unit, detail` | DB B | **New · DB B** |
| Name, **Price · optional**, **Unit** segment (each · hour · sq ft · job), **Description · optional, shows on invoices** | The description prints under the line on the PDF and the pay page | DB B + DB C (line `detail`) | **New · DB B/C** |
| "Used on 3 invoices · last on Oct 2" | `use_count`, `last_used_at` | DB B | **New · DB B** |
| **Delete item** | Soft delete; a later use brings it back as unsaved history | DB B | **New · DB B** |

### 1.12 Recurring (`3h`, `3j`) — reached from Books

| Control | What it does | Backend | Status |
|---|---|---|---|
| ‹ Books · **+** | Back; + → new recurring (`3i` blank) | DB D | **New · DB D** |
| Title **Recurring** + **PRO** tag | Visual only (F6) | none | **New** |
| "$X per month · N recurring" | Monthly = monthly + weekly × 52/12 + yearly/12 | DB D | **New · DB D** |
| Info banner: "On It logs each charge on its date. PRO is part of an upcoming plan. It's included free for now." | — | none | **New** |
| **Next 2 weeks** total + rows ("OCT 6 · Corner Fuel · $60.00") | Projected due dates in the next 14 local days (weekly items repeat) | DB D | **New · DB D** |
| **All recurring**, A–Z: vendor, "Category · Monthly", amount, "Next Nov 2" | Tap → `3i`; swipe → Edit / Delete | DB D | **New · DB D** |
| Skip notice on a row ("Couldn't log Rent, free limit reached") | From `last_skipped_on` / `last_skip_reason` (L3) | DB D | **New · DB D** |
| Empty ("No recurring expenses … **Add recurring expense** · When a charge repeats, On It will offer to set it up.") | → `3i` | DB D | **New · DB D** |

### 1.13 Edit recurring expense (`3i`)

| Control | What it does | Backend | Status |
|---|---|---|---|
| Cancel / Save | Saves the item | DB D | **New · DB D** |
| Vendor, Amount, **Category** › picker | Category from the 10 expense categories (Q5) | DB D | **New · DB D** |
| **How often**: Weekly · Monthly · Yearly | Sets `cadence`; `anchor_day` from Next charge | DB D | **New · DB D** |
| **Next charge** (date) | `next_on` | DB D | **New · DB D** |
| **Log automatically** switch ("Adds the expense to Books each time") | `auto_log`. On → the cron logs it. Off = **paused** (L3 Pause): listed and projected, never logged, no notice. Turning it back on starts from the next due date, with no back-fill (L15) | DB D | **New · DB D** |
| **Stop & delete** | Soft delete (`deleted_at`). Rows already logged stay (L3) | DB D | **New · DB D** |

### 1.14 Invoices list (`4a`)

| Control | What it does | Backend | Status today |
|---|---|---|---|
| Tabs **All · Unpaid · Paid · Quotes** (outlined pills; selected = gold border `#D4AF37` 2 px on `#F6EBC6`) | Filter (`?filter=`) | existing | **Partial.** Filter chips exist; restyled. List crossfades with a 12 px shift |
| Summary "4 unpaid · $4,390.00" | Balance-due sum (part-paid aware) | existing | **Partial.** "Still owed · N invoices" exists; restyled |
| "↕ A–Z by client" caption | **Is** the sort toggle (L1); tapping it flips Newest ↔ A–Z | none | **Partial.** `SortToggle` exists (commit 2); the caption style is new |
| Month headers ("OCTOBER 2026") | Unchanged grouping | none | **Built** |
| Compact row: client, "INV-0039 • 10/1/2026", amount, chip (**DUE OCT 16**, **OVERDUE**, PAID, DRAFT, CONVERTED, VOID), chevron | Tap → detail; swipe → delete + undo (kept) | existing `due_date` | **Partial.** Today large cards with status-word chips. The DUE-date chip is new (from `due_date`; no due date → "SENT") |

### 1.15 Expenses list (`4b`, from Books › View expenses)

| Control | What it does | Backend | Status today |
|---|---|---|---|
| ‹ Books · **+** | + → the Add expense sheet (extracted from Books into a shared component) | existing insert + cap | **New** (the sheet exists only on Books) |
| **Search** ("Search vendor or category") | Client-side filter over the loaded rows | none | **New** |
| **Week / Month** switch + group headers with subtotal | Week (default) or month groups, each with its own subtotal; remembered per device (`onit-expenses-group`); sort applies inside (Q2) | none | **Partial** (weekly only today) |
| Row: initial avatar (or receipt thumb), vendor, **↻** when `recurring_id`, "Category · date", amount | Thumb → lightbox (kept); swipe → delete + undo (kept) | DB D for ↻ | **Partial** (no ↻) |
| Sort toggle | L2 | none | **Built** (commit 3) |

### 1.16 Books (`5a`)

| Control | What it does | Backend | Status today |
|---|---|---|---|
| **Recaps** row (`auto_awesome`, "Coming soon" while RECAPS_LIVE is off, unread dot, chevron) | Live: opens the latest recap / `/recaps`. Free/canceled: locked → paywall (reports). Off: shows "Coming soon" and is a non-interactive row (not a button) | existing | **Partial.** `RecapsCard` exists between the tiles and the buttons. It moves to the top as a row, keeping every state |
| **Net** card ("$9,267.42 · Net · all time · 41 invoices") | → `/summary?period=all` | existing | **Built** |
| Tiles **Collected / Still owed / Spent** as buttons (number headline, press .97) | → income / unpaid / expenses | existing | **Built** |
| **+ Add expense** | Sheet (kept); cap → paywall | existing | **Built** |
| List card · **View expenses** (subtitle follows the expenses list's grouping and sort, e.g. "A–Z by vendor, by week"; count) | → `/expenses` | existing | **Partial.** A button today; becomes a list-card row with a count |
| List card · **Recurring PRO** ("7 charges · next Oct 6", "$X /mo") | → Recurring | DB D | **New · DB D** |
| **Income & Expenses** (design: "Summary & PDFs"; Q4 keeps today's label) | → `/summary` | existing | **Built** |

### 1.17 Settings (`0c` grouped; F3)

The main screen has grouped rows. Each row opens a sub-screen
(`/settings/<name>`, with a Back button to `/settings`) or links to a tab.

| Row (group) | Goes to / does | Backend | Status today |
|---|---|---|---|
| **Clients** · count (YOUR BUSINESS) | → `/clients` (Clients segment) | DB A (count) | **New.** No count until DB A |
| **Products & Services** · count | → `/clients?segment=products` | DB B (count) | **New.** No count until DB B |
| **Business profile** | Sub-screen: name, website, slogan, logo, invoice style (template, colours, background, live preview) | existing | **Partial.** Today these are inline cards |
| **Recurring expenses** · "In Books" (MONEY) | → Books › Recurring | DB D | **New · DB D** (the row lands with the screen) |
| **Payouts** · "Connected" / "Set up" | Sub-screen: the Stripe Connect card (all four states, card switch, payouts-paused note), PayPal / Cash App / Venmo, Zelle | existing | **Partial.** Inline today |
| **Plan** · Free / Trial / Subscribed / Founder (ACCOUNT) | Sub-screen: subscription (manage / trial copy / past-due), free usage summary, subscribe/trial CTA + disclosure, **Have a code?**, founder row | existing | **Partial.** Inline today |
| **Help & feedback** | Sub-screen: How On It works (`TutorialReference`), Replay the walkthrough, Contact us (`mailto:brandon@dynastyweb.co`, Q9), Terms, Privacy | none | **New** |

---

## 2. Existing features the design doesn't show, and where they go

Nothing below is removed. Removing any of them needs the founder's yes.

| Screen | Exists today (not in the frames) | Goes to |
|---|---|---|
| Chat header | **New chat** (`edit_square`), **Recent conversations** (`history`) sheet (last 5) | Stays in the header, left of the "How On It works" pill, on Chat only |
| Chat thread | Draft invoice card (LineItemsEditor, revise, lock-on-send), ExpenseCard confirmation, ReceiptBubble + LoggedExpenseCard (just merged), retry on failure, duplicate warning, quiet free-usage line, TTS replies, guest mode (5 parses), PaywallModal, the "Getting that photo ready…" line | Unchanged. Voice and typed chat keep making documents exactly as today; the template is a second path |
| Chat | First-run tutorial, install banner | Unchanged. Tutorial copy/mocks change to "+ → Voice" and the new bar |
| Invoices | Swipe delete + undo, part-paid "due of $X", converted-quote chip, void chip, the `?filter=` deep links (recap CTA, Books tile) | Kept in the compact row (§1.14) |
| Invoice detail `/invoices/[id]` | Record payment, payments ledger, mark paid, deposit, draft editor, revise, quote → invoice, resend/share, PDF, delete | Not in the frames. Unchanged, apart from M4 on mark paid, and the unit/detail display after DB C |
| Expenses | Receipt thumbnail + lightbox, swipe delete + undo, empty-state copy | Kept (§1.15) |
| Books | `RecapsCard` states (locked → paywall, "first recap lands Monday"), Spent bump/roll after an add, count-up, `/summary` (periods + Income/Expense PDFs), `/recaps` history | Kept. Recaps becomes the top row (§1.16) |
| Settings → Business | Business name / website / slogan, logo upload/replace/remove, invoice style (4 templates, colours, background pick, live preview) | **Business profile** sub-screen |
| Settings → Payments | Stripe Connect (Coming soon / Connect / Finish setup / In review / Connected + card switch + payouts paused + notice), PayPal/Cash App/Venmo + group Save, Zelle (encrypted, Save/Remove) | **Payouts** sub-screen. `/settings?connect=return|refresh` (Stripe return URLs) and the `connect` push (`render.ts` url `/settings`) forward to `/settings/payouts` with the query kept. The server URLs don't change |
| Settings → Subscription | Founder "Free access · via code", subscription manage (billing portal returns to `/settings`), trial/past-due copy, free-plan usage, subscribe/trial CTA + disclosure + Terms/Privacy, **Have a code?** (CodeEntry), billing notice | **Plan** sub-screen. `/settings?upgraded=…` (checkout return, `RETURN_PATHS.settings`) forwards to `/settings/plan` |
| Settings → Records | **Vault** button (`/vault`) | Row **Records (Vault)** in YOUR BUSINESS. `getParentRoute('/vault')` stays `/settings` |
| Settings → Invite | Referral link, Copy, Share (only with `referral_code`) | Row **Invite a contractor** (ACCOUNT) → sheet with Copy / Share |
| Settings → Notifications | Push toggle, draft-nudge sub-toggle, install / denied / unsupported hints, preview-only test pushes | Row **Notifications** (ACCOUNT) → sub-screen, everything as is |
| Settings | **Sign out** (clears chat storage, unsubscribes push) | Bottom of the main screen, below the groups |
| Settings | **Delete account** (typed DELETE) | Bottom of the main screen, its own red-bordered card, as today |
| Settings | Terms · Privacy, "On It · a Dynasty Web product · $9.99/month" footer | Main screen footer |
| `/vault`, `/recaps`, `/summary`, `/install`, pay page, onboarding | — | Unchanged. The pay page and PDFs gain unit + detail after DB C |

---

## 3. Proposed migrations (NOT written, NOT applied)

**Process, each one separately (CLAUDE.md):**
1. `npx supabase migration list`;
2. `db push --dry-run`;
3. the exact file list + full SQL shown to the founder;
4. the founder's "yes" in that conversation;
5. `db push`;
6. `npm run db:privcheck`, PASS/FAIL per check.

**Rules for every file:**
- Names sort after `20261002000001`.
- RLS + owner policies in the same file (SECURITY.md).
- Every text column has a CHECK cap.
- `revoke all … from anon`; no DELETE / TRUNCATE / REFERENCES / TRIGGER for
  authenticated.
- RPCs are `security invoker`, `set search_path = public`, execute granted to
  authenticated only.
- Each file adds SKIP-gated check rows to
  `supabase/snippets/privilege_check.sql` (the P-section pattern) in the same
  commit.
- None adds a `profiles` column.

### A. `…_clients_saved_list.sql` (merge 2)

**Preflight** (read-only; run and **report** before the push; no merging):

```sql
select user_id, lower(btrim(name)) as name_key, count(*), array_agg(name order by created_at)
from public.clients group by 1, 2 having count(*) > 1;
```

If this returns rows, the unique index can't be built. The founder decides
case by case.

**Columns:**
```sql
saved_at timestamptz,
prompt_dismissed_at timestamptz,
notes text check (notes is null or char_length(notes) <= 500),
updated_at timestamptz not null default now(),
deleted_at timestamptz,
name_key text generated always as (lower(btrim(name))) stored
```

**Key:** drop `unique (user_id, name)` and add `unique (user_id, name_key)`.
- The chat upsert targets `user_id,name_key`. Verify `ON CONFLICT` on a
  generated column on the local stub first; the fallback is a trigger-kept
  plain column.
- The chat lookup moves from `.ilike('name', …)` (an unescaped `%`/`_` acts as
  a wildcard) to `name_key`.

**Index for linking:**
`create index … on public.invoices (user_id, lower(btrim(client_name))) where deleted_at is null`.

**RLS:** split the `FOR ALL` "own clients" policy into select / insert /
update. No DELETE (soft delete).

**RPCs:**
- `save_client(p_name, p_phone, p_email, p_address, p_notes) returns table(id uuid, linked int)`
  1. Upsert on `name_key`; stamp `saved_at`; clear `deleted_at`.
  2. **Link past invoices:**
     ```sql
     update invoices set client_id = <id>
     where user_id = auth.uid() and lower(btrim(client_name)) = <name_key>
       and deleted_at is null and client_id is distinct from <id>
     ```
     `client_id` isn't pinned by `lock_sent_invoice_fields`, so sent and paid
     rows link too. The `client_name` snapshot never changes.
  3. Return the count. One transaction.
- `client_name_usage(p_name text) returns table(invoices int, quotes int)`:
  for the `3c` note.
- `client_summaries() returns setof (…)`: one row per non-deleted client, with
  - `saved`, `doc_count`, `invoice_count`, `quote_count`, `open_count`,
    `open_balance`, `overdue_count`, `overdue_balance`, `quotes_out`,
    `total_paid`, `last_used_at`;
  - computed from invoices (`balance = total − amount_paid`, not deleted).

  It feeds the list status line, the "USED BEFORE · NOT SAVED" group, the 2nd-use
  prompt and the detail tiles.

  **Dependency (not blocking): refunds.** `fix/disputes-refunds` adds
  `invoices.refunded_amount` (migration `20261005000000_payment_reversals.sql`,
  not applied). Once it is live, **"Total paid" = Σ(`amount_paid` −
  `refunded_amount`)**. How A handles it, by apply order:
  - refunds applied first → A's file sorts after `20261005000000` and
    `client_summaries()` subtracts `refunded_amount` from the start;
  - A applied first → A ships with Σ `amount_paid`, and the refunds branch
    (or a small follow-up migration) does `create or replace function
    client_summaries()` with the subtraction. The UI reads `total_paid`
    either way, so no client change.

  Check `npx supabase migration list` before writing A's file to pick the
  branch.

**Check rows** (new section Q):
- RLS on;
- the exact policy set (no DELETE);
- anon nothing;
- authenticated has no DELETE / TRUNCATE;
- the `name_key` unique index exists;
- `notes` cap;
- each RPC is `security invoker` with execute granted to authenticated only.

### B. `…_products_services.sql` (merge 2)

```sql
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  name_key text generated always as (lower(btrim(name))) stored,
  unit text not null default 'each' check (unit in ('each','hour','sq ft','job')),
  unit_price numeric(12,2) check (unit_price is null or unit_price between 0 and 10000000),
  detail text check (detail is null or char_length(detail) <= 300),  -- "Description · shows on invoices"
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

- RLS: owner select / insert / update; no DELETE.
- **Usage counts:** `record_product_use(p_items jsonb) returns setof text`.
  - The input is the finalized lines: `[{name, unit, unit_price}]`, ≤ 50
    lines, each validated.
  - Upserts on `name_key`: `use_count + 1`, `last_used_at = now()`, and the last
    `unit` / `unit_price` while unsaved; clears `deleted_at`.
  - Returns the names that are unsaved with `use_count ≥ 2` (prompt
    candidates).
  - Called fire-and-forget after a successful finalize (chat and template), so
    it never blocks or changes the send.
- **Check rows** (section R): as in A, plus the RPC.

### C. `…_public_invoice_line_unit_detail.sql` (merge 2)

- No table change. `unit` and `detail` live inside each `invoices.line_items`
  JSONB element.
- `create or replace function get_public_invoice(…)` passes `'unit'` and
  `'detail'` through, with the same signature and grants.
- It's the public pay-page RPC, so the existing H-section rows must still
  PASS. Add one row: the function body's element keys.

### D. `…_recurring_expenses.sql` (merge 3)

```sql
create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  vendor text not null check (char_length(btrim(vendor)) between 1 and 120),
  vendor_key text generated always as (lower(btrim(vendor))) stored,
  description text check (description is null or char_length(description) <= 200),
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  category text not null default 'other' check (category in
    ('food','fuel','supplies','tools','travel','maintenance','subscriptions','phone','insurance','other')),
  cadence text not null check (cadence in ('weekly','monthly','yearly')),
  anchor_day smallint check (anchor_day between 1 and 31),
  next_on date not null,
  auto_log boolean not null default true,         -- "Log automatically" (off = paused)
  last_logged_on date,
  last_skipped_on date,
  last_skip_reason text check (last_skip_reason is null or last_skip_reason in ('free_limit','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index … on public.recurring_expenses (user_id, vendor_key, cadence) where deleted_at is null;
```

- **On `expenses`:**
  - `add column recurring_id uuid references public.recurring_expenses(id) on delete set null`;
  - `create unique index … on public.expenses (recurring_id, spent_on) where recurring_id is not null`.
    That index makes the cron idempotent.
- **Column grants:**
  - authenticated may update only `vendor, description, amount, category,
    cadence, anchor_day, next_on, auto_log, deleted_at, updated_at`;
  - `last_*` and `expenses.recurring_id` are written only by the service-role
    cron.
  - `recurring_id` is not client-insertable, so a client can't forge a
    "Recurring" row. Today `expenses` has a table-level INSERT grant; this
    switches it to a column list, which must cover every column the app
    writes (chat, receipt, Books sheet). Verify that on the local stub.
- **Repeat detection:** `repeat_candidate(p_expense uuid) returns table(vendor text, amount numeric, cadence text, prior_on date)`.
  - Same `lower(btrim(vendor))`, amount ±10 %, gap in the cadence windows
    (§1.5).
  - Skips vendors with a live recurring item.
  - Index `expenses (user_id, lower(btrim(vendor)), spent_on desc) where deleted_at is null`.
- **`notification_log_type_chk`** gains `recurring_skipped` (drop + add, as
  `20261001000010_recaps.sql` did).
- **Check rows** (section T):
  - RLS, policies, column grants (no `last_*`, no `recurring_id` insert/update
    for authenticated);
  - no DELETE;
  - both unique indexes;
  - the extended type check;
  - the RPC.

**Caps (F6):** the cron inserts as the service role, and
`enforce_free_expense_limit` (a SECURITY DEFINER BEFORE INSERT trigger)
still fires. On `PAYWALL_LIMIT_EXPENSE`:
- skip and stamp `last_skipped_on` / `last_skip_reason = 'free_limit'`;
- advance `next_on`;
- push "Couldn't log Rent, free limit reached" (dedupe
  `recurring_skipped:<item>:<due>`), plus the in-app row notice and a Books
  banner.

The cap is never bypassed.

### E. Not proposed

- Pro gating: the tag is visual only (F6).
- A first-name column for the greeting (Q10).

---

## 4. Motion

**`1d` exact values** (F5). These apply to the composer, the menu and the
template only.

| Moment | Value |
|---|---|
| Tap + | Icon rotates 45° into ×, fill soft gold → ink: **300 ms `cubic-bezier(.3,1.5,.5,1)`**. Background/colour: 200 ms |
| Scrim | Cream frost fades in: **220 ms `ease`**. The bar stays sharp (above the scrim) |
| Options rise | Rise 16–40 px (the farthest option starts lowest: `16 + 12 × distance` px), scale .88 → 1, nearest + first, **45 ms** apart: **340 ms `cubic-bezier(.2,1.3,.4,1)`**. Opacity 180 ms ease, same delay |
| Close (×, scrim, option) | Everything reverses, **no stagger: 180–300 ms**. Use 180 ms for options/scrim; the + glyph returns on its own 300 ms curve |
| Pick invoice / quote | The menu closes, then the field becomes the template card in place. **Same frame**: the bar never jumps |
| Template slots and controls not in `1d` (slot fill, sheets, keypad, add/remove item, send enabled, M1) | MOTION-SPEC tokens (below) |

**Everywhere else: MOTION-SPEC tokens.**
- Durations: `--motion-fast` 160, `--motion-base` 240, `--motion-slow` 400.
- Easings: `--ease-standard`, `--ease-emphasized`, `--ease-spring` (success
  moments only).

Each row of the motion file's inventory maps to the nearest token. Hero
moments keep their choreography and total length, built from token curves.

| Inventory row | Built as | Commit |
|---|---|---|
| Slot filled (dashed → ink, 1.04 pop) | `--motion-base` + `--ease-spring` (it's a success moment) | 2·10 |
| Pick from sheet (sheet down, text hands off) | `--motion-slow` `--ease-emphasized` | 2·10 |
| Qty ± (number rolls, totals odometer) | `--motion-fast` `--ease-emphasized`, selection haptic | 2·11 |
| Keypad sheet rises | `onit-sheet-in` (`--motion-slow` standard) | 2·11 |
| Add item / remove item (+ 5 s undo) | expand `--motion-slow` / collapse `--motion-base`, emphasized | 2·11 |
| Send becomes enabled | Founder change: no pill sweep. The black circle fades/scales in from the muted disabled disc, `--motion-base` `--ease-spring` | 2·12 |
| **M1** send (compress → ↗ shoots → card folds → sent card springs → SENT stamp, ~1.1 s) | Token curves; replaces MOTION-SPEC §4 lock-on-send for template sends. Chat-card sends keep §4 | 2·12 |
| Receipt snapped | **Built** (merged `feat/receipt-motion`, MOTION-SPEC §8) | — |
| New On It message (typing dots, rise 8 px) | `--motion-base` standard (MOTION-SPEC §2 rise) | 1·3 |
| Prompt appears (rise 14 px) / Not now (sink 10 px) | `--motion-base` spring / `--motion-fast` standard | 2·13 |
| **M2** save client / item (arc into the Clients tab, tab bump, +1, bot line, ~1 s) | Token curves | 2·13 |
| **M3** make recurring (loop draws, "Monthly" tag, ↻ spins, shimmer, ~950 ms) | Token curves | 3·4 |
| New entry saved (slides into its A–Z slot + 1.2 s gold glow) / Form save (label → ✓) | `--motion-slow` emphasized | 2·14 |
| Swipe delete (resistance past 40 %) / Undo re-expand | `SwipeableRow` update, `--motion-base` | 2·14 |
| Long-press (lift 1.02, dim, menu scales in) / Search reflow / A–Z letter jump + header pulse | `--motion-fast` / `--motion-fast` / `--motion-base` + pulse | 2·14 |
| Client detail (shared avatar/name, tiles count up) | View transition when supported, else rise. Count-up as Books | 2·4 |
| Unit / frequency segment thumb | `SortToggle` pattern (`--motion-fast`) | 2·8, 3·2 |
| Invoices filter (outline slides, list crossfade + 12 px shift) | `--motion-fast` standard | 1·10 |
| Status change sent → viewed (`viewed_at`, tag flip) | `--motion-base` | 1·10 |
| **M4** marked paid (DUE fades, PAID stamp settles, card dips 3 px, Collected/Still owed roll, ~1.2 s) | Token curves; **replaces MOTION-SPEC §6 gold sweep** (L11 changed) on the detail page and in lists | 1·13 |
| Books first visit **of the day** count-up (today: once per session) | Keep the §9 mechanics; the key becomes per local day | 1·12 |
| Books recaps dot pulse once | `--motion-slow` ring | 1·12 |
| Tile press .97 | **Built** | — |
| Recurring auto-logged (shimmer + "Logged automatically") / skip banner | `--motion-slow` / `onit-rise` | 3·6 |
| **M5** tab switch (disc slides, icon 4 px bounce, 160 ms crossfade) + Chat press (.9, 1 px down) | Disc `--motion-slow` + `--ease-spring`; crossfade `--motion-fast`. Replaces the §10 side entry | 1·4 |
| Failed action (6 px × 3 decaying shake + inline Retry) | Update §7 (today a 320 ms shake): `--motion-slow` emphasized | 1·14 |

Haptics stay Android-only (L12). Reduce Motion: every row becomes a ≤ 200 ms
crossfade and numbers swap without rolling (global kill switch +
`usePrefersReducedMotion`, built in commit 1). MOTION-SPEC gets a §14 for this
pass in each merge's docs commit.

---

## 5. Commit sequence — one item per commit, three merges to `main`

> **Changed 2026-10-03 (founder):** the three merges are built in order on
> `feat/ui-redesign` but ship to `main` **together**, once merges 2 and 3
> pass preview. Merge 1 passed its device pass and is held.

**Already on the branch, and staying:**
- commits 1–5 (`c99ce2d` … `91f6c09`);
- the release frames (`66bb0be`);
- the receipt-motion merge (`b5c261d`);
- this doc.

Settings is moved out one group per commit (1·5–1·8) and the grouped main
screen comes last (1·9), so every commit keeps every Settings feature
reachable.

Commit 4 (`b7d488d`, the gold + on today's bar) stays in history; the composer
is redone on top of it in 1·1.

**For every code commit:** `tsc`, `npm test`, `next build`. Then each merge
gets:
1. a branch preview (`vercel` → alias `onit-dynastyweb-preview.vercel.app`);
2. an iPhone pass;
3. the founder's OK;
4. `--no-ff` merge to `main` + push.

**DB commits** contain the migration file plus its check rows only. The
founder applies each one with the CLAUDE.md flow **before** the merge that
needs it. Never tap Connect / Finish setup on the preview.

### Merge 1: no-DB visual changes (composer, nav, Settings, sorting, motion)

**Status 2026-10-03: built on `feat/ui-redesign`, awaiting the branch
preview + iPhone pass** (hashes in PUNCH-LIST). Two small follow-ups rode
along: `dfab3cf` (tutorial mock bubbles) and `9bc293d` (Books tile chevron).

| # | Commit | Risk |
|---|---|---|
| 1·1 | **Composer bar:** 44 px + (left, `data-splash-target`), "Message On It…" field with gallery + camera inside, 44 px send (right). Voice session in the field (Listening… / Done = stop & send, Speak between takes, × in the + slot ends the session, level dot). Splash lands on the new +. Tutorial mocks + copy ("Tap +, then Voice") | **High** (iOS gesture, splash, keyboard) |
| 1·2 | **+ menu:** Voice / New invoice / New quote with subtitles and `1d` values. Voice = `micTap()` in the tap. New invoice/quote: Q1 | Medium |
| 1·3 | **Chat thread visuals:** TODAY divider, bubble styles, typing dots + 8 px rise (MOTION-SPEC §2), greeting copy "Snap a receipt, or tap + to start an invoice or quote." (Q10) | Low |
| 1·4 | **Nav to the frames:** Chat pill 64×36, Books dot, M5 disc + bounce + crossfade, Chat press depth | Medium |
| 1·5 | Settings › **Business profile** sub-screen (`/settings/business`: business, logo, invoice style), reached from a row; adds the shared section routing | Low |
| 1·6 | Settings › **Payouts** sub-screen + `/settings?connect=` and `connect` push forwarding (Stripe flow re-tested on preview without tapping Connect) | **High** (payments) |
| 1·7 | Settings › **Plan** sub-screen + checkout / billing-portal return forwarding | Medium |
| 1·8 | Settings › **Notifications** sub-screen, **Invite** sheet, **Help & feedback** sub-screen | Low |
| 1·9 | **Settings main screen** (`0c`): grouped rows (YOUR BUSINESS / MONEY / ACCOUNT), Clients + Products rows → Clients tab (no counts yet), Records (Vault), sign out, delete account, footer | Medium |
| 1·10 | **Invoices list** to `4a`: tabs, summary, caption toggle, compact rows with DUE chips, filter crossfade, viewed flip | Medium |
| 1·11 | **Expenses list** to `4b`: header +, shared Add expense sheet, search, **Week / Month** switch (Q2) | Medium |
| 1·12 | **Books** to `5a`: Recaps row on top (all `RecapsCard` states), list card (View expenses + count, subtitle follows the expenses grouping/sort), daily count-up, dot pulse | Medium |
| 1·13 | **M4 marked paid** (replaces MOTION-SPEC §6) | Medium |
| 1·14 | **Failed action:** shake + inline Retry (MOTION-SPEC §7) | Low |
| 1·15 | Docs: MOTION-SPEC §14 (merge 1), Design Standard nav/composer, PUNCH-LIST rows | — |

**Note on merge 1:** no row or button in merge 1 points at a feature that needs a migration:
  - the Settings Recurring row and the Books Recurring row land in merge 3;
  - the ↻ icon lands in merge 3;
  - Clients/Products counts land in merge 2.

### Merge 2: Clients + Products + template

| # | Commit | DB | Risk |
|---|---|---|---|
| 2·1 | **Migration A** (clients saved list, `save_client`, `client_name_usage`, `client_summaries`, check rows). **Preflight duplicate report first** | **yes** | Medium |
| 2·2 | Chat client upsert + lookup → `name_key` (fixes the `ilike` wildcard) | needs 2·1 | Medium |
| 2·3 | **Clients segment** (`3a`/`3d`): search, A–Z + rail, swipe + long-press Edit/Delete, empty state, Settings Clients count | needs 2·1 | Medium |
| 2·4 | **Client detail** (`3b`): Call/Text/Email (or open Edit), tiles, info, documents list | needs 2·1 | Low |
| 2·5 | **New / Edit client** (`3c`): history note + linking via `save_client` | needs 2·1 | Medium |
| 2·6 | **Migration B** (products + `record_product_use`, check rows) | **yes** | Medium |
| 2·7 | **Migration C** (public `get_public_invoice` passes `unit` + `detail`) | **yes** | Medium |
| 2·8 | **Products segment + edit** (`3e`/`3f`/`3g`): long-press Edit/Duplicate/Delete, unit segment, Settings Products count | needs 2·6 | Medium |
| 2·9 | **Line units + detail end to end:** `LineItem` type, LineItemsEditor, PDF templates, PayView, parse normaliser + AI rule, `draftFingerprint`, duplicate math | needs 2·7 | Medium |
| 2·10 | **Template card, part 1:** card in place (`1d` "same frame"), header/switch/close, Name slot + Client sheet (saved + USED BEFORE), Item slot + Item sheet | needs 2·1, 2·6 | **High** |
| 2·11 | **Template card, part 2:** two-row items, stepper, qty + price keypads, add/remove + undo, capped list with fades | — | Medium |
| 2·12 | **Template card, part 3:** Extra info sheet + chips + deposit/due parsing, totals, **black ↗ send** (`aria-label`, disabled state), `finalize()`, **shared 48 h duplicate check at Send (L17)**, sent-doc card + M1, `record_product_use` after finalize. The + menu's New invoice/quote now open it (ends Q1's interim). Client detail's **Invoice** action opens it prefilled | — | **High** |
| 2·13 | **Save prompts:** queue, client + item prompts, M2 flight + bot lines | — | Medium |
| 2·14 | **List motion:** new-entry glow, swipe resistance/undo, long-press lift, search reflow, letter jump pulse, form ✓ | — | Low |
| 2·15 | Docs (MOTION-SPEC §14 merge 2, PUNCH-LIST) | — | — |

### Merge 3: Recurring + cron

| # | Commit | DB | Risk |
|---|---|---|---|
| 3·1 | **Migration D** (recurring_expenses, `expenses.recurring_id` + unique index, `repeat_candidate`, `recurring_skipped` type, check rows) | **yes** | Medium |
| 3·2 | **Recurring screen + edit** (`3h`/`3i`/`3j`): PRO tag + copy, monthly total, next 2 weeks, A–Z list, Log automatically, Stop & delete | needs 3·1 | Medium |
| 3·3 | Books **Recurring PRO** list-card row + Settings **Recurring expenses** row | needs 3·1 | Low |
| 3·4 | **Repeat detection + "Make it recurring?"** prompt (chat, receipt and Books saves) + M3 | needs 3·1 | Medium |
| 3·5 | **Cron step** in `/api/followups`, production only, **before** recaps. It handles: `auto_log` items due by local today (owner timezone); one row per item per due date (`on conflict do nothing`); back-fill ≤ 3, each cap-checked; resume never back-fills; cap skip → stamp + advance + `recurring_skipped` push; monthly anchored to `anchor_day` (31 → last day) | needs 3·1 | **High** |
| 3·6 | **↻ on expense rows** + "Logged automatically" shimmer + skip notice (Recurring row + Books banner) | needs 3·1 | Low |
| 3·7 | Docs (MOTION-SPEC, PUNCH-LIST, SECURITY.md cron line) | — | — |

**Why this order:**
- Merge 1 touches no table and can ship alone.
- In merge 2, each table lands before its UI, and units land before the
  template, which reads them.
- The prompts come after the template that triggers them.
- The cron is last: it is the only scheduled writer, and it touches the caps
  and recaps.

---

## 6. Open questions — all answered 2026-10-03 and locked in §L (kept for the record)

1. **Q1 — Merge 1 New invoice / New quote.** The template needs DB A/B, so it
   lands in merge 2. Until then, the two options keep commit 4's working path:
   a fresh chat seeded "Invoice for " / "Quote for " and focused. That makes a
   real document, so it isn't a dead button. The subtitle would read "Say or
   type it" instead of "Guided template". **Default:** that. **Alternative:**
   hold merge 1's + menu until merge 2.
2. **Q2 — Expense groups.** L2 (locked) keeps weekly groups; `4b` and the Books
   row ("A–Z by vendor, by month") show monthly groups. **Default:** keep L2
   (weekly), with the Books subtitle "A–Z by vendor, by week", until you say
   switch.
3. **Q3 — Unpriced items.** Your rule enables Send with a client and an item.
   An item without a price would go out as a $0.00 line. **Default:** Send also
   needs a price on every named item; the hint says "Add a price for Labor".
   Say if $0 lines should be allowed (for example on quotes).
4. **Q4 — Books button label.** The design says "Summary & PDFs"; `feat/recap`
   renamed it to "Income & Expenses". **Default:** keep "Income & Expenses".
5. **Q5 — Recurring categories.** The frames use Software / Storage /
   Equipment / Materials, which aren't expense categories. **Default:** use
   the existing 10 (Software → Subscriptions, Equipment → Tools, Materials →
   Supplies, Storage → Other). No new categories without your yes (they would
   change the CHECK, the tax summary and the recaps).
6. **Q6 — Deleting a client.** **Default:** un-save (it leaves the list) and
   clear phone / email / address / notes, with a 5 s undo. Their invoices and
   the history row stay, so they can be offered again after a later invoice.
7. **Q7 — "Not now".** The design re-asks at the next repeat (rev 1 proposed
   never again). **Default:** the design.
8. **Q8 — Log automatically = Pause.** **Default:** the switch is L3's Pause,
   and "Stop & delete" is its Delete.
9. **Q9 — Help & feedback "Contact us".** Which address should it open
   (`mailto:`)? Until you name one, the row offers How On It works, Replay
   walkthrough, Terms and Privacy only (no dead contact button).
10. **Q10 — Greeting name.** "Morning, Jess" needs an owner first name, which
    isn't stored. **Default:** a time-of-day greeting without a name; no new
    `profiles` column.

---

## 7. Conflicts re-checked

| Item | Paywall caps | Recaps | Chat AI flow | Keyboard / iOS |
|---|---|---|---|---|
| New composer | Untouched | — | `send()` / `micTap()` / `onPickReceipt` unchanged; only their buttons move. `primeSpeech()` stays inside the Voice tap | The field is the only text input in the bar. Camera/gallery are buttons inside the field, so tapping them must not focus the field (`preventDefault` on pointerdown). The 44 px + is still a 44 px touch target |
| Template | Send → `finalize()`: invoice cap + `PAYWALL_LIMIT` hint, quotes uncapped. `ready` only when Send is enabled, so no early pre-build rows | Ordinary invoice rows | Bypasses `/api/parse` on purpose. New `convoId` per template. Duplicate check at Send (L17) | Keypads are custom, so the OS keyboard is never open with them. Sheets with search use `data-kb-fit` |
| Save prompts | — | — | After the share completes; never in the share gesture | No inputs |
| Clients / Products | Not capped | Recaps read `invoices.client_name`; unaffected | `record_product_use` is fire-and-forget after finalize | Forms are sheets with `data-kb-fit` |
| Recurring cron | Service-role insert; the cap trigger still fires; skip + notify, never bypassed | Runs **before** recaps so the day's rows count; snapshots are insert-once | — | — |
| Settings split | Plan sub-screen keeps the checkout/portal flows; return URLs forwarded | — | — | — |

---

## 8. What the frames say vs this branch (summary)

**Already matching:**
- 5 tabs (L7);
- sorting (L1, L2-ordering);
- receipt photo → bubble (merged);
- Books Net / tiles / Add expense;
- "How On It works";
- `usePrefersReducedMotion`;
- the segment control pattern.

**To build:**
- **Merge 1 (no DB):**
  - composer + menu + in-field voice;
  - chat visuals;
  - nav polish;
  - Settings grouping + sub-screens;
  - Invoices / Expenses / Books to their frames;
  - M4 and the failure shake.
- **Merge 2:** Clients, Products, units/detail, the template with the ↗
  send, the prompts, list motion.
- **Merge 3:** Recurring, repeat detection, the cron.

---

## 9. Merge of `feat/receipt-motion` (`b5c261d`)

Merged with `--no-ff` before any composer work (F8). It brings ReceiptBubble,
LoggedExpenseCard, the real flash after the camera sheet, and the thumbnail
storage cap; MOTION-SPEC §8 is now "as built".

**Five conflict hunks,** all additive (both sides added different lines in the
same spot). Both sides were kept; no logic was chosen between:

| File | Conflict | Resolution |
|---|---|---|
| `MOTION-SPEC.md` "Batch B as built" | §8 line (receipt-motion marks it superseded) vs §9 line (this branch added the button rise timings) | receipt-motion's §8 line + this branch's §9 line |
| `PUNCH-LIST.md` | Both appended sections at the same spot | Both sections, this branch's first |
| `chat` `interface Msg` | `quiet?` (paywall usage line) vs `receipt?` + `logged?` | All three fields |
| `chat` `/api/parse` body | `.filter((m) => !m.quiet)` vs `.map(({ role, content }) => …)` | Both: drop quiet lines, then send role + text only |
| `chat` expense save | `fetchUsageLine('expense')` vs `setExpenseExiting(false)` | Both: the exit reset, then the usage line |

**Checks:** `tsc --noEmit` clean, `npm test` 96/96, `next build` passes
(placeholder env). Not yet checked on a device; it rides merge 1's preview.
