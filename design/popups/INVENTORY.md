# Popup inventory — the Chat tab and everything launched from it

Read-only audit. **No code was changed.** Compiled from the code on `main` (base
`9879bf4`) after reading `CLAUDE.md`, `ONIT-SPEC.md`, `SECURITY.md` and
`PUNCH-LIST.md`.

**Scope.** The Chat tab (`src/components/tabs/ChatView.tsx`) and every surface a
Chat action can open or land on: the composer menu, the invoice/estimate card and
its inline editors, the template builder and its sheets, the in-app camera,
`PaywallModal`, the public estimate page (`/e/<token>`) reached from Chat's
Estimate link actions, the invoice detail screen reached from a sent card /
converted estimate, and the bank activity stack reached from Books.
Out of scope: Books, Clients, Invoices, Settings and Recaps screens themselves
(other than the sheets they share with Chat).

**Method.** Grepped for `window.confirm` / `alert` / `prompt`, every
Sheet / Modal / Dialog / Drawer / Popover / Toast / Banner component and its
opener, inline error and "Retry" copy, disabled-with-explanation states, and
every write path that is irreversible or money-related. Read the components
listed under each entry.

**Headline finding.** There is **no native `window.confirm`, `alert` or `prompt`
anywhere in `src/`.** Every confirmation in the app today is either an existing
component or an inline row. The gaps below are therefore about *missing*
confirmations and inconsistent patterns, not about native dialogs.

**Legend**

- Tier **P1** money / irreversible / blocking · **P2** frequent ·
  **P3** rare.
- `today`: `none` | `native dialog` | `inline text` | `existing component`.
- "unverified" marks anything the repo alone cannot settle (a live state, an
  exact line I could not pin, or copy produced at runtime by a helper).
- On screen the word is **estimate**; `quote` is only the stored value
  (`invoices.kind = 'quote'`). I never print the stored kind.

---

## FAMILY: confirm (a decision, nothing destroyed)

### P-01 · Change guard — "Update it, or start a new invoice?"
- **tier** P1
- **trigger** A parse would change the linked invoice's client, or replace every
  line item, while a draft row is already linked. `ChatView.tsx:1483` sets
  `pendingChange`; rendered at `ChatView.tsx:4353-4376`.
- **today** existing pattern — an inline card in the transcript (`div.card`),
  not a sheet. No shared component.
- **why** Money: applying the parse would silently rewrite a saved invoice.
  Blocks the flow until answered (the card keeps the previous draft).
- **data** the pending draft (local React state), the linked invoice number via
  `formatDocNumber(kind, no)`, `docKind(draft)`.
- **actions** primary `Update INV-0007` (or `Update Q-0003` — built from
  `formatDocNumber`) · secondary `Start a new invoice` · destructive none.
- **copy today** "This would change INV-0007. Update it, or start a new
  invoice?" (message at `:1485-1489`, card at `:4357-4359`).
- **states** idle; pending (both buttons `disabled={phase !== null}`); error
  none; repeat-tap protected by `phase` **state only** (no synchronous ref) —
  same accepted limitation noted for the composer.
- **design** none in `design/`.

### P-02 · Client picker — "Which client is this for?"
- **tier** P1
- **trigger** `finalize()` paused because the typed name is close to saved
  clients but not exact (`matchOrCreateClient`, `lib/services/clients`).
  State `ChatView.tsx:612`; rendered `ChatView.tsx:4377-4398`.
- **today** existing pattern — inline card, auto-scrolled into view
  (`scrollToClientQuestion`, `ChatView.tsx:3602-3615`).
- **why** Blocks sending: nothing is created until answered; the Send button
  reads "Pick a client first".
- **data** `clientChoice.candidates` (id + stored spelling) and the typed name.
- **actions** primary = one button per candidate, label is the client name ·
  secondary `New client “{typed}”` · destructive none.
- **copy today** "Which client is this for?" · `New client “{typed}”`.
- **states** idle; pending (`disabled={phase !== null}`); error none; repeat-tap
  — `pickClientChoice` returns early when `phase` is set.
- **design** none in `design/`.

### P-03 · Replace an unfinished template
- **tier** P1
- **trigger** New invoice / New estimate (menu, `?template=`, a client's Invoice
  action) while a saved template has a client or a named item.
  `ChatView.tsx:3455` (`replaceAsk`), rendered `ChatView.tsx:4479-4483`.
- **today** existing component — `ReplaceTemplateSheet.tsx`
  (`role="alertdialog"`, scrim/Escape/swipe = Keep editing).
- **why** Irreversible for the user: Start new discards the saved template and
  soft-deletes its draft row (`discardTemplateRow`).
- **data** `unfinishedTitle(saved)` (title string — **unverified** exact text),
  the requested kind, an optional client.
- **actions** primary `Keep editing` · secondary `Start new` · destructive is
  `Start new` (styled `btn-outline`, not red).
- **copy today** title is `unfinishedTitle(...)`; buttons `Keep editing` /
  `Start new`.
- **states** idle; pending none (the choice is synchronous); error none;
  repeat-tap — the sheet unmounts on the first tap.
- **design** none in `design/`.

### P-04 · Discard an expense draft
- **tier** P2
- **trigger** × on the Record-expense template when any field was entered
  (`entered = amount > 0 || vendor || description || category !== 'other'`).
  `ChatView.tsx:4519-4528`, rendered `:4475-4478`.
- **today** existing component — `ReplaceTemplateSheet` reused with
  `title="Discard this expense?"`, `keepLabel="Keep editing"`,
  `startNewLabel="Discard"`.
- **why** Loses typed money data; ask, but it is cheap to retype, so not P1.
- **data** nothing beyond the label.
- **actions** primary `Keep editing` · secondary `Discard`.
- **copy today** "Discard this expense?" · `Keep editing` · `Discard`.
- **states** idle; pending none; error none; repeat-tap — unmounts on tap.
- **design** none in `design/`.

### P-05 · Send — deliberately NO confirmation
- **tier** P2
- **trigger** `Looks right — send it` on the card (`ChatView.tsx:4040`,
  `:4051`) or a bare affirmative typed/spoken (`isAffirmative`, used at
  `ChatView.tsx:1175`).
- **today** none (by design).
- **why** Not justified: the OS share sheet is the decision point, and a second
  in-app confirm would add a tap to the core loop. Recorded here so it is not
  "fixed" later.
- **data** n/a.
- **actions** primary `Looks right — send it` · labels while busy
  `Preparing…`, `Building your PDF…`, `Sending…`, `Pick a client first`.
- **copy today** `Looks right — send it` · `Preparing…` · `Building your PDF…` ·
  `Sending…` · `Pick a client first`.
- **states** idle / pending / repeat-tap: `finalizingRef` (synchronous) +
  `phase` (`ChatView.tsx:1699-1710`); error → P-65..P-68.
- **design** `design/laptop/MAPPING.md`, `design/laptop/LAPTOP-SPEC.md` cover
  the card's laptop geometry. No send-confirm design.

---

## FAMILY: destructive-confirm

### P-06 · Delete an invoice or an estimate
- **tier** P1
- **trigger** `Delete invoice` / `Delete estimate` at the bottom of the detail
  screen. `InvoiceDetailScreen.tsx:1272` (button), `:1315` (modal mount).
- **today** existing component — `DeleteConfirmModal.tsx` (typed `DELETE`
  required for sent/paid/overdue; `data-kb-fit`; scrim click = cancel).
- **why** Irreversible-feeling and money: it leaves the list and Books totals.
- **data** `client_name`, document number, `status`, the record type; plus the
  no-free-slot line for invoices and the typed-confirm field.
- **actions** primary `Delete` (red, `Deleting…` while busy) · secondary
  `Cancel` · destructive `Delete`.
- **copy today** "Delete invoice?" / "Delete estimate?" · "Are you sure you want
  to delete this invoice? It will be removed from your list and Books totals." ·
  "This record has been sent. Deleting it will remove its total from your Books
  income totals." · "On the free plan this still counts toward your invoice
  limit — deleting it won't free up a slot." · "Type DELETE to confirm" ·
  `Cancel` · `Delete` · `Deleting…`.
- **states** idle; pending (`busy` disables both buttons, "Deleting…"); error —
  none surfaced by the modal itself (a failed delete is silent here; see P-93);
  repeat-tap — `busy` prop, but `handleConfirm` also guards on `busy`.
- **design** `design/laptop/MAPPING.md` (invoice detail actions). No popup
  design.

### P-07 · Delete an expense
- **tier** P1
- **trigger** Books → expenses row delete. `src/components/ledger/ExpensesPane.tsx:430`.
- **today** existing component — `DeleteConfirmModal` (`recordType="expense"`).
- **why** Money data; changes Net/Spent totals.
- **data** vendor/amount `title`, record type.
- **actions** primary `Delete` · secondary `Cancel`.
- **copy today** "Delete expense?" · "Are you sure you want to delete this
  expense? It will be removed from your list and Books totals." · `Cancel` ·
  `Delete`.
- **states** as P-06.
- **design** none.

### P-08 · Delete a client
- **tier** P1
- **trigger** Client detail delete. `src/app/(app)/clients/[id]/page.tsx:188`.
- **today** existing component — `DeleteConfirmModal` (`recordType="client"`).
- **why** Irreversible for the client record (documents stay).
- **data** client name as `title`.
- **actions** primary `Delete` · secondary `Cancel`.
- **copy today** "Delete client?" · "Are you sure you want to remove this client
  from your list? Their invoices and estimates stay in your history." ·
  `Cancel` · `Delete`.
- **states** as P-06.
- **design** none.

### P-09 · Delete a recorded payment
- **tier** P1
- **trigger** Trash icon on a ledger row. `InvoiceDetailScreen.tsx:1126`
  (icon), inline confirm at `:1128-1141`.
- **today** inline text — two chips inside the row, not a dialog.
- **why** Money: removes a payment, which un-pays the invoice. Should be a
  real confirm with the amount in it.
- **data** method label (`ledgerEntryLabel`), date, `money(amount)`.
- **actions** primary `Yes` · secondary `No` · destructive `Yes`.
- **copy today** "Delete?" · `Yes` · `No`.
- **states** idle; pending — none (`handleDeletePayment` at `:633` has no busy
  state in the row); error — none; repeat-tap — guarded only by the row's own
  `confirming` flag.
- **design** none.

### P-10 · Delete a line item
- **tier** P2
- **trigger** `Delete` / trash on a line row (`LineItemsEditor.tsx`, `remove(i)`).
- **today** none — immediate removal, 260 ms close animation, no undo on the
  invoice detail screen or the chat card.
- **why** Would be justified on a saved invoice (destroys a priced line). On a
  draft it is recoverable by re-adding, so P2.
- **data** the line's description and amount (available, unused).
- **actions** today `Delete` (label) / trash icon (ledger variant).
- **copy today** `Delete` · `Delete line {n}` (aria-label).
- **states** idle; pending none; error none; repeat-tap — identity check against
  the latest list before removing.
- **design** `design/estimates/ESTIMATES-DESIGN-SPEC.md` (line items).

### P-11 · Remove an attachment (chat card / invoice detail)
- **tier** P2
- **trigger** × on a thumbnail. `AttachmentsEditor.tsx` (`remove`,
  `aria-label="Remove attachment"`); saved files also hit
  `removeSavedAttachment` (`ChatView.tsx:873`).
- **today** none — removes from state immediately and deletes the stored object
  and row.
- **why** Irreversible delete of a stored file the client may already have seen.
- **data** nothing shown (no filename, no size).
- **actions** today `Remove attachment` (aria-label only).
- **copy today** `Remove attachment` · "Up to {ATTACHMENT_MAX} images." ·
  `Adding…`.
- **states** idle; pending none; error swallowed (`catch { /* the optimistic
  removal already took it off screen */ }`).
- **design** `design/estimates/ESTIMATES-DESIGN-SPEC.md` (attachments strip).

### P-12 · Remove an estimate attachment
- **tier** P2
- **trigger** × on an attachment tile. `EstimateAttachments.tsx:222`
  (`removeItem`).
- **today** none — `deleteEstimateAttachment` runs on tap.
- **why** Same as P-11; the client may have signed the estimate with it.
- **data** none shown.
- **actions** today tile-level remove; `Retry` only on upload failure.
- **copy today** "Couldn't remove that file. Please try again." ·
  "This estimate is locked." · "10 of 10 max. Remove one to add another."
- **states** idle; pending `deletingId` (tile shows a deleting state); error
  inline `role="alert"`; repeat-tap guarded by `if (deletingId) return`.
- **design** `design/estimates/ESTIMATES-DESIGN-SPEC.md`.

### P-13 · Discard a queued payment
- **tier** P1
- **trigger** `Discard` on an "needs attention" queued payment.
  `PendingPaymentNotice.tsx` (`onDiscard`), mounted
  `InvoiceDetailScreen.tsx:1294`.
- **today** none — one tap drops a money write the user had already entered.
- **why** Money: the payment is discarded, not queued and not recorded.
- **data** `money(e.amount)` and `e.reason`.
- **actions** primary `Retry` · secondary `Edit` · destructive `Discard`.
- **copy today** "{money} needs attention" · `Retry` · `Edit` · `Discard` ·
  "Payment pending: {money}" · "1 payment waiting to sync" / "{n} payments
  waiting to sync". · "The invoice stays unpaid until the server confirms it."
- **states** idle; pending (pending rows are informational only); error
  `role="alert"`; repeat-tap — not guarded (unverified on device).
- **design** none.

### P-14 · Convert an estimate to an invoice — NO confirmation
- **tier** P1 · **GAP**
- **trigger** `Convert to Invoice`, gold bar pinned above the tab bar for a
  signed estimate. `src/components/invoice-detail/ConvertQuoteBar.tsx`;
  handler `EstimateDetail.tsx:299` (`convertToInvoice`).
- **today** none — one tap inserts a real, numbered invoice and navigates to it.
- **why** Money + irreversible: it burns an invoice number and creates a
  document that can be sent to the client. Needs a confirm naming the estimate
  and the amount.
- **data** (available, unused) estimate number, client, total.
- **actions** today `Convert to Invoice` / `Converting…`.
- **copy today** `Convert to Invoice` (`EstimateDetail.tsx:570`) ·
  `Converting…` · failure "Couldn't convert this estimate. Please try again." ·
  attachment failure "Couldn't copy this estimate's attachments, so nothing was
  converted. Please try again."
- **states** idle; pending `converting` + `convertingRef`; error inline
  `actionError`; repeat-tap guarded (`convertingRef`), idempotency key
  `convert-{id}`.
- **design** `design/estimates/ESTIMATES-DESIGN-SPEC.md`, `PUBLIC-PAGE-STATES.md`.
  No convert-confirm design.

### P-15 · Revise a locked, sent invoice — NO confirmation
- **tier** P1
- **trigger** `Revise` on a locked card. `ChatView.tsx:4074`,
  `reviseInvoice` → `startRevision` (`ChatView.tsx:3704`).
- **today** none; the explanatory line under the button is the only signal.
- **why** Creates a new invoice copy (a new number on its first save). It is a
  draft, not a send, so this is defensible — but it silently starts a second
  document from a locked one.
- **data** the original number (`Replaces INV-0007` note), client, items.
- **actions** today `Revise`.
- **copy today** `Revise` · "Opens an editable copy as a new invoice. The
  original stays as it was." · estimate variant "Makes a new estimate you can
  edit. This one and its link stay as they are." · "Copy or share the link with
  {client}." · "This invoice was sent, so it's locked."
- **states** idle; pending `revisingRef` + `phase`; error none displayed.
- **design** `design/laptop/MAPPING.md` (Invoices card).

### P-16 · Close a template × — NO confirmation
- **tier** P1 · **GAP**
- **trigger** × on the template builder (`TemplateCard.tsx`, aria-label
  `Close template`) → `closeTemplate` (`ChatView.tsx:3444`).
- **today** none — discards the saved template, clears the draft and
  soft-deletes the pre-built draft row.
- **why** Loses unsent work with client, items and prices. The expense template
  asks (P-04); the invoice/estimate template does not. Same shape, different
  rule.
- **data** `unfinishedTitle(...)` available (used by P-03).
- **actions** today `Close template` (aria-label).
- **copy today** `Close template` (aria-label) · `New invoice` / `New estimate`
  header chip.
- **states** idle; pending — the close is instant; error none.
- **design** `design/laptop/MAPPING.md`.

### P-17 · Deactivate an estimate link
- **tier** P2
- **trigger** `Deactivate link` on a sent estimate.
  `EstimateDetail.tsx:614-616`; inline confirm at `:622-640`.
- **today** inline text — a red strip in place of the row.
- **why** Irreversible for the client (the link stops working) and they may be
  looking at it. A confirm is right; an inline strip is borderline for a
  destructive action.
- **data** nothing (no number, no client).
- **actions** primary `Yes, deactivate` · secondary `Cancel`.
- **copy today** "Deactivate this link?" · `Yes, deactivate` · `Deactivating…` ·
  `Cancel` · `Link deactivated` · "This estimate link is closed."
- **states** idle; pending (`busy === 'revoke'`); error `actionError`; repeat-tap
  guarded by `busy`.
- **design** `design/estimates/PUBLIC-PAGE-STATES.md`.

### P-18 · Delete a product from the list
- **tier** P3
- **trigger** Clients → Products removal. `ProductsList.tsx:169`.
- **today** none + `UndoToast` ("Item deleted."), 6 s.
- **why** Undo covers it; a confirm would be noise.
- **data** n/a.
- **actions** `Undo` · `Dismiss`.
- **copy today** "Item deleted." · `Undo`.
- **states** toast auto-dismiss 6 s; navigation dismisses it.
- **design** none.

### P-19 · Delete a client from the list
- **tier** P3
- **trigger** Clients list swipe/remove. `ClientsList.tsx:165`.
- **today** none + `UndoToast` ("Client deleted.").
- **why** Same as P-18.
- **copy today** "Client deleted." · `Undo`.
- **states** as P-18.
- **design** `design/laptop/MAPPING.md` (Clients).

---

## FAMILY: picker

### P-20 · Client picker sheet
- **tier** P2
- **trigger** the Name slot on the template (`TemplateCard.tsx`, `setSheet({type:'client'})`).
- **today** existing component — `PickerSheet` via `ClientSheet`
  (`TemplateSheets.tsx:43`); `role="dialog"`, `aria-modal`.
- **why** Picker: list is too long and too variable for an inline menu.
- **data** saved clients A–Z with "4 invoices"; unsaved history under USED
  BEFORE · NOT SAVED ("Used once · Sep 18").
- **actions** primary = row pick · secondary `Cancel` · create `New client`.
- **copy today** `Client` (title) · `Search {n} clients` · `Use “{q}”` ·
  "Nothing saved yet. Type a name above to use it." · `Cancel` · `New client`.
- **states** idle; pending `loading={rows === null}`; error — a failed RPC sets
  `rows` to `[]` (reads as empty, not as an error); repeat-tap — a row pick
  closes the sheet.
- **design** `design/laptop/MAPPING.md` §Clients (the 560 product dialog).

### P-21 · Product / service picker sheet
- **tier** P2
- **trigger** an item row's name on the template (`setSheet({type:'item'})`).
- **today** existing component — `ItemSheet` (`TemplateSheets.tsx:76`).
- **why** Same as P-20.
- **data** saved products with price ("$85.00/hr", "No price") and history
  items with last price.
- **actions** row pick · `New product or service` · `Cancel`.
- **copy today** `Product or service` · `Search {n} items` · `Use “{q}”` ·
  `No price` · `New product or service`.
- **states** as P-20.
- **design** `design/laptop/MAPPING.md` §Clients.

### P-22 · One-off name row — `Use “{q}”`
- **tier** P3
- **trigger** typing a name that matches nothing. `PickerSheet.tsx:155`.
- **today** inline row in the picker.
- **why** Saves nothing; clarifies that the name is not on file.
- **data** the search text (capped 120 chars).
- **actions** primary `Use “{q}”`.
- **copy today** `Use “{q}”`.
- **states** idle only.
- **design** none.

### P-23 · New client / new product form inside the picker
- **tier** P3
- **trigger** `+ New …` in the picker (`renderCreate`).
- **today** existing component — `ClientForm` / `ProductForm` embedded in the
  sheet, with a sticky `Cancel · Save` bar.
- **why** Form sheet: too big for a row, and it must not lose the picker's
  search.
- **data** name pre-filled from the search.
- **actions** `Save` · `Cancel` (returns to the list).
- **copy today** `Cancel` · `Save` (form-owned — **unverified** exact labels).
- **states** idle; pending per-field save guard (UX batch 4); error inline;
  repeat-tap guarded by the form.
- **design** `design/laptop/MAPPING.md` §Clients.

### P-24 · "An existing payment" picker (deposit)
- **tier** P3
- **trigger** `An existing payment` path on a deposit card.
  `DepositCard.tsx` (`PaymentPicker`).
- **today** existing inline list (`PaymentPicker`), disabled with
  `EXISTING_EMPTY` copy when there are no candidates.
- **why** Picker inside a form: the choice is the whole point of the path.
- **data** candidate payments (`paymentCandidates`, `lib/bank-deposits`).
- **actions** pick one, then `Save`.
- **copy today** `An existing payment` · "Link it to one you already logged" ·
  `EXISTING_EMPTY` / `EXISTING_EMPTY_HELPER` (helper constants —
  **unverified** text).
- **states** idle; pending the card's `busy`; error `role="alert"`.
- **design** `ReviewStack.dc.html`, `BankAccounts.dc.html` (repo root exports).

### P-25 · "Which invoice?" picker (deposit)
- **tier** P3
- **trigger** `A new payment for an invoice` path.
- **today** native `<select>` inside the card, placeholder
  "Choose an invoice".
- **why** Picker; native select is acceptable on mobile, though it is the only
  native form control in this flow.
- **data** open invoices with `INV-0007 · Client · $balance`.
- **actions** choose, then `Save`.
- **copy today** "Which invoice?" · "Choose an invoice".
- **states** idle; pending/repeat as the card.
- **design** as P-24.

### P-26 · "Other money received" classification chips
- **tier** P3
- **trigger** `Other money received` path.
- **today** inline radio chips (`OTHER_MONEY_RECEIVED`).
- **why** Picker with a consequence: which totals the money counts in.
- **data** six classifications + `classificationNote` under them.
- **actions** chip pick, then `Save`.
- **copy today** "Other money received" · "Not from an invoice" · "Pick what the
  money was, so the totals can say whether it counts."
- **states** idle; note text changes with the pick.
- **design** as P-24.

### P-27 · Expense category and date
- **tier** P2
- **trigger** the expense confirmation card.
- **today** inline chip row + native date input (`ExpenseCard.tsx`).
- **why** Fine inline; recorded for completeness.
- **data** `EXPENSE_CATEGORIES` with `CATEGORY_LABEL`.
- **actions** chip pick; date input.
- **copy today** `Expense` · "Scanned from receipt" / "From your message" ·
  "Add what you bought (optional)" · `Save expense` · `Saving…` ·
  `Change something`.
- **states** idle; pending `saving`; error inline `error` prop; repeat-tap
  `disabled={!canSave}` with `saving`.
- **design** `design/laptop/MAPPING.md` (Books).

### P-28 · Record-payment date picker
- **tier** P2
- **trigger** `Other day` tile in `RecordPaymentSheet`.
- **today** an invisible native `<input type="date">` covering the tile.
- **why** The only OS picker in the sheet; acceptable, but it is invisible, so
  the tile is the affordance.
- **data** `pickedDate`, short-formatted.
- **actions** `Today` · `Yesterday` · `Other day` / `Calendar`.
- **copy today** `Date received` · `Today` · `Yesterday` · `Other day` ·
  `Calendar`.
- **states** idle; nothing pending.
- **design** none.

### P-29 · Composer "+" menu
- **tier** P2
- **trigger** the `+` button. `ComposerMenu.tsx`; opened by
  `plusTap()` (`ChatView.tsx:~3470`).
- **today** existing component — portal scrim + rising options, `role="menu"`,
  Escape/scrim/outside tap close.
- **why** Picker (four ways to start). Justified.
- **data** static options.
- **actions** `Voice` · `New invoice` · `New estimate` · `Record expense`.
- **copy today** `Voice` / "Say it, On It writes it" · `New invoice` /
  "Guided template" · `New estimate` / "Guided template" · `Record expense` /
  "Guided template" · `Start something` (aria-label).
- **states** idle; pending — none; repeat-tap — `plusMenu` state + 180 ms close.
- **design** `design/laptop/MAPPING.md` (Chat composer).

### P-30 · Recent conversations
- **tier** P3
- **trigger** the header history icon → `onit-history` event
  (`ChatView.tsx:945-950`), rendered `:4653-4686`.
- **today** existing pattern — custom sheet (`role="dialog"`,
  `aria-label="Recent conversations"`), scrim click closes.
- **why** Picker over the last 5 archived conversations.
- **data** `history` from `localStorage` (title, date, Sent/Draft).
- **actions** row opens · scrim closes.
- **copy today** `Recent conversations` · "Nothing here yet — your last 5
  conversations will show up." · `Sent` · `Draft`.
- **states** idle; empty; no pending/error (local only).
- **design** none.

### P-31 · Photo viewer
- **tier** P3
- **trigger** tapping a receipt bubble or an attachment tile (`PhotoViewer`).
- **today** existing component — full-screen stage with index/close.
- **why** Not a decision; a viewer. Listed so it is not rebuilt as a sheet.
- **data** the photo, caption, index.
- **actions** close · next/prev.
- **copy today** component-owned; **unverified** (not read in this pass).
- **states** **unverified**.
- **design** `design/estimates/PUBLIC-PAGE-STATES.md`.

---

## FAMILY: form sheet

### P-32 · Record payment
- **tier** P1
- **trigger** the sticky `Record payment` bar (`RecordPaymentBar.tsx`, mounted
  `InvoiceDetailScreen.tsx:1300`).
- **today** existing component — `RecordPaymentSheet.tsx` (portal, bottom sheet,
  drag handle, built-in keypad so the OS keyboard never covers the form).
- **why** Money entry, multi-field, and it must be able to report its own
  outcome — a full sheet is right. Cannot be dismissed while saving.
- **data** `clientName`, `money(balance)`, `depositRemaining`, methods,
  `money(amount)` preview, `Leaves $X due`.
- **actions** primary `Mark paid · $X Zelle` / `Record deposit · $X …` /
  `Save $X` / `Enter an amount` / `Amount too high` · secondary close × ·
  destructive none.
- **copy today** `Record payment` · "{client} · {money} balance" ·
  `Paid in full` · `Deposit` · `Partial` / `Other amount` · `Paid with` ·
  `Date received` · `Saving…` · `Amount too high` · `Pays it off in full` ·
  `Leaves $X due` · `Type the amount received`.
- **states** idle; pending `saving` + `submittingRef` + `savingRef` (Escape,
  scrim and drag all no-op while saving); error `role="alert"` with
  `paymentFailureMessage`; repeat-tap guarded, one idempotency key per
  submission.
- **design** none in `design/` (invoice detail redesign predates it).

### P-33 · Estimate signature
- **tier** P1
- **trigger** `Sign estimate` / the sticky Sign bar on the public estimate page
  (`EstimateView.tsx:240`).
- **today** existing component — `SignSheet.tsx` (Draw/Type tabs, consent
  checkbox, `role="dialog"`).
- **why** Legal agreement + irreversible. A sheet with an explicit consent
  checkbox is the right shape.
- **data** `sheetSubtitle(payload)`, attachment count, consent label/helper,
  `stillNeededText`.
- **actions** primary `Approve estimate` / `Approving…` · secondary `Clear`,
  `Draw`/`Type`, close × · destructive none.
- **copy today** `Sign estimate` · "Draw your signature in the box" · "Your
  typed name is your signature" · `Clear` · `Full legal name` ·
  "Type your name below to sign" · "Includes {n} attachments" ·
  `Approve estimate` · `Approving…` · "Couldn't approve. Please try again."
- **states** idle; pending `submitting` (scrim disabled); error `role="alert"`;
  repeat-tap `disabled={!canSubmit}`.
- **design** `design/estimates/ESTIMATES-DESIGN-SPEC.md` (§2.3).

### P-34 · Estimate approved (success)
- **tier** P2
- **trigger** a successful signature (`EstimateView.tsx:250`).
- **today** existing component — `SuccessSheet.tsx`.
- **why** Confirms an irreversible act and hands over the saved link.
- **data** business name, estimate number, job line, signature, signer, date,
  total, link.
- **actions** primary `View signed estimate` · secondary `Copy link` / `Copied`.
- **copy today** "Estimate approved." · "{business} has been notified." ·
  `Estimate {n}` · `Approved` · `Signed by` · `Date` · `Total` ·
  "Save this link. It's your copy of the signed estimate." · `Copy link` ·
  `Copied`.
- **states** idle; pending none; error none.
- **design** `design/estimates/PUBLIC-PAGE-STATES.md`.

### P-35 · Chat invoice / estimate card (inline form)
- **tier** P1
- **trigger** a ready draft from a parse, the template send, Revise, or a
  restore (`ChatView.tsx:3841` onward).
- **today** existing — not a sheet: the card *is* the form (line items, tax,
  deposit, attachments, notes entry points, Send).
- **why** Keeping it in the transcript is the design; a modal would hide the
  conversation that produced it. Listed so no one "fixes" it into a sheet.
- **data** client, items, subtotal/tax/deposit/remaining, due date, attach­ments,
  duplicate badge, lock badge.
- **actions** `Looks right — send it` / `Share invoice` · `Download draft` ·
  `Undo last edit` · `Change something` · `Revise` · estimate:
  `Copy link` / `Share`.
- **copy today** `Total due` · `Estimate total` · `Deposit due now` ·
  `Subtotal` · `Tax ({n}%)` · `Remaining` · `Download draft` ·
  "Drafts don't hold a live pay page." · `Undo last edit` · `Change something` ·
  `Similar invoice sent recently`.
- **states** idle / `Preparing…` / `Building your PDF…` / `Sending…`;
  error inline (P-65..P-68, P-82); repeat-tap `finalizingRef`.
- **design** `design/laptop/MAPPING.md`, `design/laptop/LAPTOP-SPEC.md`,
  `design/tokens.css`.

### P-36 · Template builder card
- **tier** P2
- **trigger** `+` menu → New invoice / New estimate; `?template=`; a client's
  Invoice action.
- **today** existing — card takes the composer's slot (`TemplateCard.tsx`).
- **why** Inline form by design (the chat stays visible).
- **data** client chip with "address · phone" or "No address or phone on file";
  item rows; qty; unit; price; line totals; extra info; totals.
- **actions** `Make it an invoice` / `Make it an estimate` · row taps open the
  sheets · trash per row + 5 s `Undo` bar · Send ↗.
- **copy today** `New invoice` / `New estimate` · `Add a client to send` ·
  `Add an item to send` · `Add a price for {item}` · `Add a client and an item
  to send` · `Item removed` · `Undo` · `Add attachment` ·
  `Send invoice` / `Send estimate` (aria-label).
- **states** idle; pending — `sendState` `disabled`/`preparing`/`ready`/`busy`;
  error inline hint; repeat-tap — hint replaces Send until complete.
- **design** `design/laptop/MAPPING.md` (Chat).

### P-37 · Invoice detail edit card
- **tier** P2
- **trigger** an open draft's detail screen.
- **today** existing — inline card (`InvoiceDetailScreen.tsx:1150-1250`).
- **why** Inline by design; the editable fields are few.
- **data** line items, `Deposit required` (`None` / `Percentage (%)` /
  `Fixed ($)`), notes, private notes.
- **actions** line-item controls; selects; textareas (`blur` saves).
- **copy today** "Tap a value to edit" · `Deposit required` · `None` ·
  `Percentage (%)` · `Fixed ($)` · `Notes` · "Deposit due before materials are
  ordered. 3-5 day lead time." · "Private notes · only you see these" ·
  "Tech, manager, anything not for the customer."
- **states** idle; pending — per-field async write; error inline
  `attachmentsError`; repeat-tap — **unverified** per-field.
- **design** `design/laptop/MAPPING.md` (Invoices).

### P-38 · Expense confirmation card
- **tier** P1
- **trigger** a photo read or a typed expense that produced an amount.
- **today** existing — inline card (`ExpenseCard.tsx`), never auto-saved.
- **why** Money: one review before a write. Correct shape.
- **data** amount, vendor, date, category, "what you bought", receipt thumbnail.
- **actions** primary `Save expense` / `Saving…` · secondary ×
  (`Cancel expense`) · `Change something`.
- **copy today** `Expense` · `Scanned from receipt` / `From your message` ·
  `Save expense` · `Change something` · `The receipt you photographed`.
- **states** idle; pending `saving`; error `error` prop; repeat-tap
  `disabled={!canSave}`.
- **design** `design/laptop/MAPPING.md` (Books).

### P-39 · Add attachment chooser (invoice card)
- **tier** P2
- **trigger** `+ Add attachment` (`AttachmentsEditor.tsx`), flag
  `NEXT_PUBLIC_IN_APP_CAMERA` on.
- **today** existing sheet (`role="dialog"`).
- **why** Picker: camera vs library. Justified.
- **data** none.
- **actions** `Take photo` · `Photo library` · `Cancel`.
- **copy today** `Add attachment` · `Take photo` / "Use your camera" ·
  `Photo library` / "Choose from your photos" · `Cancel`.
- **states** idle; pending `busy` ("Adding…"); error inline; repeat-tap
  `disabled={busy || full}`.
- **design** `design/estimates/ESTIMATES-DESIGN-SPEC.md`.

### P-40 · Add attachment sheet (estimate)
- **tier** P2
- **trigger** `Add attachment` on an editable estimate
  (`EstimateAttachments.tsx`).
- **today** existing sheet, drag handle, `role="dialog"`.
- **why** Picker with three sources; also shows remaining slots (10 max).
- **data** `attachmentSheetLabel(room)`.
- **actions** `Take photo` · `Photo library` · `Files` / "PDF only" ·
  `Cancel`.
- **copy today** `Add attachment` · "Up to 10 attachments." ·
  "10 of 10 max. Remove one to add another." · "Your client sees these on the
  estimate. They can view, not upload." · `Read-only after approval` ·
  `Upload failed` · `Retry` · "Couldn't load the attachments. Refresh to try
  again." · "Couldn't save that caption. Try again."
- **states** idle; pending per-upload ring (`uploadProgressLabel`); error
  `role="alert"`; repeat-tap — one upload per file, `Stop uploading` × cancels.
- **design** `design/estimates/ESTIMATES-DESIGN-SPEC.md`.

### P-41 · Quantity / price keypad
- **tier** P2
- **trigger** the qty number or the price chip on an item row.
- **today** existing component — `KeypadSheet.tsx` (`role="dialog"`,
  `<h2>{title}</h2>` at `:72`).
- **why** Numeric entry without the OS keyboard covering the form. Justified.
- **data** current value, item name.
- **actions** keypad, done/cancel.
- **copy today** title from `title` (Price / Quantity — **unverified** exact
  string); keypad keys 0-9.
- **states** idle; no pending/error.
- **design** `design/laptop/MAPPING.md`.

### P-42 · Tax
- **tier** P2
- **trigger** the tax row / "+ Add tax" (`taxOpen`, `ChatView.tsx:671`).
- **today** existing component — `TaxSheet.tsx` (`Tax` at `:39`,
  placeholder `0` at `:46`).
- **why** Numeric setting with a money consequence on every total.
- **data** current rate.
- **actions** save/cancel in the sheet (**unverified** labels).
- **copy today** `Tax` · placeholder `0`.
- **states** idle; no pending/error shown.
- **design** none.

### P-43 · Extra info (dates, notes, deposit)
- **tier** P2
- **trigger** the `Extra info · dates, notes, deposit` row.
- **today** existing component — `ExtraInfoSheet.tsx` (`Extra info` at `:58`).
- **why** Free text that changes the document's due date and deposit.
- **data** `parseExtraInfo` result (deposit type/value, due date, notes).
- **actions** text entry, done/cancel.
- **copy today** `Extra info` · placeholder "Valid for 14 days, job address,
  notes for the client…" (estimate) / "Due Friday, job address, notes for the
  client…" (invoice).
- **states** idle; no pending/error.
- **design** none.

### P-44 · Bank activity stack
- **tier** P2
- **trigger** Books → bank activity (`BankTrackingProvider.tsx:366`).
- **today** existing component — `ReviewStack.tsx` (bottom sheet on phones,
  440 px dialog ≥ md; `role="dialog"`, Escape, focus trap, edge swipe).
- **why** A queue of money decisions; a sheet is right.
- **data** counter "Item 3 of 7", tabs To review / Ignored, card content.
- **actions** one card's actions; X (flight to Books nav); tabs.
- **copy today** `Bank activity` · `To review` · `Ignored` · `All caught up` ·
  "Every bank item is accounted for." · "Everything left is in Ignored —
  restore any you still need." · `No new bank activity` · "On It checks your
  bank through the day. New charges and deposits land here." · "Nothing
  ignored. Cards you pass on land here." · `Restore`.
- **states** idle; pending per card; error → toast + inline refusal; repeat-tap
  per card (`busyIds`).
- **design** `ReviewStack.dc.html`, `BankAccounts.dc.html` (repo root).

### P-45 · Deposit card (money in)
- **tier** P1
- **trigger** a deposit row in the bank stack.
- **today** existing card inside the stack (`DepositCard.tsx`).
- **why** Writes a ledger payment or a classification — money, one Save.
- **data** merchant, `+$amount`, meta line, path radio group, invoice picker /
  payment picker / classification chips, `Looks like INV-0007`.
- **actions** primary `Save` / `Saving…` / `Waiting for the bank` · secondary
  `Don't add` · destructive none.
- **copy today** `Income` · `Pending` · "What is this deposit?" ·
  `An existing payment` / "Link it to one you already logged" ·
  `A new payment for an invoice` / "Marks the invoice paid" ·
  `Other money received` / "Not from an invoice" · `Save` · `Don't add`.
- **states** idle; pending `busy`/`waiting`; error `role="alert"`
  (`depositRefusalMessage`); repeat-tap `disabled={busy || waiting || !submit}`.
- **design** as P-44.

### P-46 · Bank review card (money out)
- **tier** P1
- **trigger** a transaction row in the bank stack.
- **today** existing card inside the stack (`ReviewCard.tsx`).
- **why** Money: writes an expense.
- **data** amount (editable, `aria-label="Amount"`), date radiogroup, category
  radiogroup, receipt thumbnail.
- **actions** `Add to record` · `Already recorded` · `Don't add` (label at
  `ReviewCard.tsx:361`); review-specific `Fix` / `Keep` pair (comment at
  `:10`).
- **copy today** `Add to record` · `Already recorded` · `Don't add` ·
  `Fix` · `Keep`.
- **states** idle; pending `busy` (buttons locked, "Adding…"); error `role="alert"`
  (`shownError`, `:333`); repeat-tap via `busyIds`.
- **design** as P-44.

---

## FAMILY: permission

### P-47 · Microphone denied
- **tier** P2
- **trigger** `getUserMedia` rejects with `NotAllowedError` / `SecurityError`
  (`ChatView.tsx:3075-3092`).
- **today** inline text above the composer — `voiceError`
  (`ChatView.tsx:4565`), `role="status"`.
- **why** Permission: the browser will not ask again, so the user needs a way
  back — today it is prose only, with no link to settings. **Gap: should be a
  sheet or an inline block with an "Open settings" affordance.**
- **data** the message; platform branch (iOS vs other).
- **actions** none (text only).
- **copy today** "Mic access is off. To use voice, turn on Microphone for On It
  in your iPhone Settings, or type instead." · "Mic access is off. To use voice,
  allow the microphone for this site in your browser settings, or type instead."
- **states** idle only; clears on the next session/end.
- **design** none.

### P-48 · Voice unsupported in this browser
- **tier** P3
- **trigger** no `mediaDevices` / no `MediaRecorder` (`ChatView.tsx:3036`).
- **today** inline text (`voiceError`).
- **why** Not a permission the user granted; a plain sentence is enough.
- **copy today** "Voice isn't available in this browser. You can type instead."
- **states** idle only.
- **design** none.

### P-49 · Camera blocked / unavailable (in-app camera)
- **tier** P2
- **trigger** `getUserMedia` video failure or a 0-frame watchdog
  (`ReceiptCamera.tsx`, `blockerFromError`, `mode === 'blocked'`).
- **today** existing full-screen state — `role="dialog"`, icon, title, body,
  three actions.
- **why** Permission/blocker: the camera cannot proceed, and the gallery is the
  fallback.
- **data** `cameraFailureCopy(failure, subject)` (title + body,
  **unverified** exact strings).
- **actions** primary `Choose from photos` · secondary `Try again` ·
  `Close`.
- **copy today** `Camera unavailable` (aria-label) · `Choose from photos` ·
  `Try again` · `Close` · "Starting the camera…".
- **states** idle(open)/blocked/retry; error = the blocked screen itself;
  repeat-tap — `capturingRef` for the shutter.
- **design** `design/estimates/ESTIMATES-DESIGN-SPEC.md` (camera/attachment
  states).

### P-50 · Camera unavailable → silent library fallback
- **tier** P3
- **trigger** no camera API / insecure context / no device before the first
  live frame (`isSilentFallback`).
- **today** none — jumps straight to the photo picker.
- **why** Not justified: there is nothing the user must decide, and the picker
  is one control away. Recorded so it is not turned into an error screen.
- **states** n/a.
- **design** none.

### P-51 · OS photo / file picker
- **tier** P3
- **trigger** `capture="environment"` and `accept="image/*"` inputs.
- **today** native OS picker (intentional — see the two-input comment at
  `ChatView.tsx:735-741`).
- **why** Not justified to replace: the OS owns camera/photos consent on iOS.
- **copy today** aria-labels only: `Take a receipt photo`,
  `Upload receipt from gallery`, `Choose attachment images`.
- **states** n/a.
- **design** none.

### P-52 · Push notifications
- **tier** P2
- **trigger** `Yes` on the payment-alerts card → `subscribeToPush()`
  (`ChatView.tsx:2700`), permission requested inside the gesture.
- **today** native browser permission prompt (unavoidable) + a result bubble.
- **why** Permission. Fine, but the failure has no way back to settings.
- **data** client name; whether online card pay is live.
- **actions** `Yes` / `Not now` on the card.
- **copy today** "Want a notification when {client} pays online?" · "Want a nudge
  if {client} hasn't paid in 2 days?" · `Yes` · `Not now` · "You're set. I'll
  notify you when {client} pays online, and again if an invoice sits unpaid for
  2 days." · "You're set. I'll nudge you if {client} hasn't paid in 2 days." ·
  "Couldn't turn that on. You can switch payment alerts on any time in
  Settings."
- **states** idle; pending — the card closes before the await; error bubble.
- **design** none.

### P-53 · Clipboard blocked
- **tier** P3
- **trigger** `navigator.clipboard.writeText` rejects.
- **today** inline note — `EstimateLinkActions.tsx` (`flash`),
  `EstimateDetail.tsx` (`setActionError`), `SuccessSheet.tsx` (`copied`
  false).
- **why** Recovery instruction; a toast is enough.
- **copy today** "Clipboard is blocked. Long-press the link to copy it." ·
  `Copied` / `Copy link` · `Link copied`.
- **states** note auto-clears after 2.2 s.
- **design** none.

---

## FAMILY: limit / upgrade

### P-54 · Paywall — hard wall from Chat
- **tier** P1
- **trigger** a capped user sends an invoice/estimate, photographs a receipt,
  or saves an expense; also the SQL triggers (`PAYWALL_LIMIT`,
  `PAYWALL_LIMIT_ESTIMATE`, `PAYWALL_LIMIT_EXPENSE`) as the backstop.
  Mounted `ChatView.tsx:4705`.
- **today** existing component — `PaywallModal.tsx` (portalled, 3 steps,
  focus trap, Escape, body scroll lock).
- **why** Blocks the flow and sells the fix. Justified as a full-screen wall.
- **data** `reason` pill (`REASON[variant]`), trial eligibility +
  `subscriptionsEnabled` from `/api/access`, plan rows, disclosure, code row.
- **actions** primary `ctaLabel(state)` (`Start my free trial` / `Start my
  plan` — **unverified** exact labels, `lib/paywall-copy`) · `One sec…` while
  busy · secondary `Not now` (aria-label on ×), `Restore Purchases`,
  `Continue`, `Back`.
- **copy today** `Nothing charged today` · `Restore Purchases` ·
  `Purchase restored.` · `RESTORE_UNAVAILABLE` (lib) · `Terms` · `Privacy` ·
  `EULA` · `One sec…` · `Continue` · `Back`.
- **states** idle; pending `busy` + `buyRef`; error `notice` slot; repeat-tap
  `buyRef` / `restoreRef` (synchronous).
- **design** `design/laptop/paywall.html`, `design/laptop/LAPTOP-SPEC.md`.

### P-55 · Soft wall from a chat nudge
- **tier** P2
- **trigger** the usage nudge card's CTA (`softWall`, `ChatView.tsx:690`,
  mounted `:4706`).
- **today** existing component — `PaywallModal` with `reason` and
  `returnTo="chat"`.
- **why** Nothing was blocked, so it opens the same wall without the "limit"
  pill. Justified: it is an offer, not a wall.
- **copy today** `invoiceUsage.nudge.eyebrow/title/body/cta` from
  `lib/soft-prompts` (e.g. "2 of 3 free invoices" — **unverified** exact
  strings) · `Not now`.
- **states** as P-54; the wall closes itself on upgrade
  (`subscribeAccess`).
- **design** as P-54.

### P-56 · Over the free cap — chat reply
- **tier** P2
- **trigger** a ready invoice/estimate or a complete expense while capped
  (`ChatView.tsx:137-142`, `:1420-1440`).
- **today** inline text — replaces the model's reply; the card still shows.
- **why** Explains why nothing saved. Inline is right (no wall until Send).
- **data** the limit from `/api/access`, the kind.
- **copy today** "Here's your invoice. You've used your {n} free invoices, so
  start your free trial to send it." · "Here's your estimate. You've used your
  {n} free estimates, so start your free trial to send it." · "Here's your
  expense. You've used your {n} free expenses, so start your free trial to save
  it."
- **states** idle only.
- **design** none.

### P-57 · Free-tier usage meter
- **tier** P3
- **trigger** a successful save of a free-tier invoice/estimate.
- **today** inline quiet line + meter (`LedgerUsageMeter`), copy from
  `lib/usage.ts` ("2 of 3 free invoices used").
- **why** Information, not a decision. No popup.
- **copy today** `{n} of {limit} free invoices used` (**unverified** exact).
- **states** idle only.
- **design** none.

### P-58 · App-open soft prompt banner
- **tier** P2
- **trigger** `/api/prompts` returns a due prompt for a signed-in user
  (`SoftPromptBanner.tsx`).
- **today** existing component — a slim strip above the tab bar; dismissible;
  hides under the keyboard.
- **why** A banner, not a popup: it must never cover the composer or a send.
- **data** `prompt.title`, `prompt.body`, `prompt.cta`.
- **actions** CTA (opens `PaywallModal`) · `Dismiss` (aria-label).
- **copy today** server-provided (`lib/soft-prompts`) — **unverified** exact.
- **states** idle; error silent (`catch { /* offline or blocked storage */ }`).
- **design** none.

### P-59 · Recurring paywall from the save prompt
- **tier** P2
- **trigger** `Make recurring` refused with `PAYWALL_RECURRING`
  (`ChatView.tsx:~3395`).
- **today** existing component — the prompt card closes, `paywallFor`
  (`'recurring'`) opens.
- **why** Limit reached; the upsell is the recovery.
- **copy today** `Make recurring` · `Not now` · `Done` · card body
  "{name} charged {money} again. Make it a {cadence} recurring expense?"
- **states** the card is replaced by the wall; no error shown (deliberate).
- **design** as P-54.

### P-60 · Voice daily limit
- **tier** P2
- **trigger** `/api/transcribe` 429 (`src/app/api/transcribe/route.ts:109`).
- **today** inline chat bubble via `userMessage` (`ChatView.tsx:3080`).
- **why** A cause-specific failure, not a dialog. Right shape.
- **copy today** "That's today's voice limit — it resets tomorrow. You can type
  in the meantime."
- **states** idle only.
- **design** none.

### P-61 · Receipt daily limit
- **tier** P2
- **trigger** `/api/parse-receipt` 429
  (`src/app/api/parse-receipt/route.ts:101`).
- **today** inline chat bubble.
- **why** Same as P-60.
- **copy today** "That's today's receipt limit — it resets tomorrow. You can
  enter details manually in the meantime."
- **states** idle only.
- **design** none.

### P-62 · Guest wall — sign in to continue
- **tier** P1
- **trigger** `/api/parse` 401 `authRequired` (`ChatView.tsx:1322`), or a guest
  Send (`:1942`).
- **today** inline bubble **plus an automatic redirect** to `/login` after
  1600 ms (`setTimeout(() => router.push('/login'), 1600)`).
- **why** Blocks the flow. The auto-redirect with no confirm is the gap: a guest
  reading the sentence is taken off the screen without choosing.
- **copy today** "Let's save your work — sign in to send this invoice." ·
  server reply from `/api/parse` (**unverified** exact).
- **states** pending `phase='redirecting'` (controls stay disabled through the
  redirect); no error; repeat-tap blocked by `sendRef`.
- **design** `design/laptop/paywall.html` covers the visual language.

### P-63 · Guest voice budget spent
- **tier** P1
- **trigger** `/api/transcribe` `authRequired` (`ChatView.tsx:3067-3073`).
- **today** inline bubble + the same auto-redirect.
- **why** Same as P-62.
- **copy today** "Create your free account to keep going." (or the server's
  `message`).
- **states** as P-62.
- **design** none.

### P-64 · Purchase / restore notices inside the paywall
- **tier** P3
- **trigger** `buy()` not started, or `Restore Purchases`.
- **today** inline `notice` line in the footer.
- **why** Report, not a decision.
- **copy today** `outcome.message` from
  `lib/subscription/start` (**unverified**) · `Purchase restored.` ·
  `RESTORE_UNAVAILABLE`.
- **states** idle; error = the notice; repeat-tap guarded.
- **design** as P-54.

---

## FAMILY: status / error

### P-65 · Send/build failure
- **tier** P1
- **trigger** any throw in `finalize()` (`ChatView.tsx:2390-2400`).
- **today** inline failed bubble + icon `Retry` (`ChatView.tsx:4150-4170`).
- **why** Blocks the flow; must name the cause and keep the draft.
- **copy today** "Couldn't finish that one. Your draft is safe." · "You're
  offline — the invoice didn't send. Your draft is safe." · "Couldn't save that
  invoice just now. Your draft is safe." · "Couldn't save your changes just
  now. Your draft is safe."
- **states** pending `phase`; error bubble; repeat-tap `retryingRef`; the
  failed bubble shakes once (`onit-shake`) + Android haptic.
- **design** `MOTION-SPEC.md` §7.

### P-66 · Shared but couldn't mark as sent — **GAP**
- **tier** P1
- **trigger** `navigator.share()` resolved but `POST /api/invoices/{id}/send`
  failed (`ChatView.tsx:2455-2466`).
- **today** inline failed bubble + `Retry`; nothing blocks.
- **why** The worst state in the app: the client already has the PDF, the
  invoice is still a draft, and no pay link exists. It deserves a blocking
  sheet ("It went out, but On It couldn't mark it sent — tap Retry"), not a
  quiet bubble the user can scroll past.
- **data** document number, client, whether the share actually completed.
- **actions** today `Retry` (icon button, `aria-label="Retry"`).
- **copy today** "Your file was shared, but I couldn't mark it as sent. Tap send
  to try again." (invoice detail variant: "Your file was shared, but I couldn't
  update the invoice. Tap Share PDF to try again.",
  `InvoiceDetailScreen.tsx:694`).
- **states** pending; error persists until retried; repeat-tap `retryingRef`.
- **design** none.

### P-67 · Share sheet didn't open
- **tier** P2
- **trigger** `navigator.share()` rejected with anything but `AbortError`
  (`ChatView.tsx:2437-2446`).
- **today** inline failed bubble naming the error + `Retry`.
- **why** Names the real cause (CLAUDE.md rule 5) — good — but the error name
  is developer-speak for a pro.
- **copy today** "The share sheet didn't open (NotAllowedError). Your draft is
  safe. Tap send to try again."
- **states** as P-65; the file is kept ready (`shareWaiting`).
- **design** none.

### P-68 · Ready to share (second-tap state)
- **tier** P2
- **trigger** the previous share failed after a slow-path build.
- **today** the Send button changes label — inline state, no popup.
- **why** Turns the retry into a deliberate step (iOS needs a fresh gesture).
- **copy today** "Your invoice is ready. Tap Share invoice to send it." ·
  `Share invoice` / `Share estimate`.
- **states** idle → `shareWaiting` matches the draft signature.
- **design** none.

### P-69 · Share cancelled
- **tier** P3
- **trigger** `AbortError` from the share sheet.
- **today** none — deliberately silent (`settleShare`, `r.status === 'cancelled'`
  returns).
- **why** Not justified: cancelling is a normal choice.
- **design** none.

### P-70 · Platform has no file share
- **tier** P3
- **trigger** `navigator.canShare` false (`share.ts` → `unsupported`).
- **today** silent download + a bubble.
- **why** Fallback, not a decision.
- **copy today** "Downloaded! Send it to {who} however you like. I'll keep an
  eye on it."
- **design** none.

### P-71 · Download draft
- **tier** P3
- **trigger** `Download draft` on the card (`ChatView.tsx:4060`).
- **today** inline info toggle + a bubble.
- **why** No confirm needed (a draft is not sent).
- **copy today** "Downloaded — it's saved as a draft. Tap send whenever you're
  ready." · "Drafts don't hold a live pay page."
- **design** none.

### P-72 · Estimate send failure
- **tier** P1
- **trigger** `requestEstimateSend` not ok (`ChatView.tsx:~2493`).
- **today** inline failed bubble + `Retry`.
- **copy today** `out.message` from `lib/estimates/owner-actions`
  (**unverified**).
- **states** as P-65.
- **design** none.

### P-73 · AI asked for something it can't look up
- **tier** P3
- **trigger** router decided `unsupported` (`ChatView.tsx:1210-1226`).
- **today** inline assistant bubble, never sent to `/api/parse`.
- **why** Plain answer, no popup.
- **copy today** "I can't look that up yet. I can tell you who hasn't paid you."
  (`UNSUPPORTED_REPLY`, `lib/tools/reply.ts`).
- **design** none.

### P-74 · AI answer missing or empty
- **tier** P2
- **trigger** `data.reply` absent (`ChatView.tsx:1444`); ask-tool returned no
  lookup (`lib/tools/reply.ts`).
- **today** inline bubble.
- **copy today** "Say that again?" · "I can't look that up yet." ·
  "I couldn't look that up just now. Ask me again in a moment."
- **design** none.

### P-75 · Feedback intent
- **tier** P3
- **trigger** `isFeedbackIntent(trimmed)` (`ChatView.tsx:1194`).
- **today** inline bubble + `Tell us about On It` button; kept out of job
  history.
- **copy today** `FEEDBACK_REPLY` (`lib/feedback-intent`) · "Tell us about
  On It".
- **design** none.

### P-76 · Editing a locked document
- **tier** P2
- **trigger** a parse that would change a sent/paid row
  (`ChatView.tsx:1465-1470`).
- **today** inline assistant bubble.
- **copy today** "That estimate's link is ready, so I can't change it here. Tap
  Revise on the card to make an edited copy." · "That invoice is paid, so it's
  locked. Start a new invoice (the compose button) for any changes." · "A
  payment has been received on that invoice, so it's locked. Start a new invoice
  for any changes." · "That invoice was already sent, so it's locked. Start a
  new invoice, or tap Revise on the card to edit a copy."
- **design** none.

### P-77 · Messaging a locked conversation
- **tier** P2
- **trigger** any message after a send (`ChatView.tsx:1132-1145`).
- **today** inline bubble + a real `New chat` button.
- **copy today** "INV-0007 is sent and locked. Tap Revise on the card to change
  it, or start a new job." · estimate: "Q-0003 is ready to share. Tap Revise on
  the card to change it, or start a new job." · `New chat`.
- **design** none.

### P-78 · Duplicate receipt
- **tier** P2
- **trigger** the same image hash already on file (`ChatView.tsx:2760`,
  `findDuplicate`).
- **today** inline assistant bubble naming the existing expense.
- **why** Good pattern: says what happened instead of a query.
- **copy today** "You already logged this receipt — $X at Vendor on 9/18/2026.
  I didn't add it twice." · "You've already logged this receipt — I didn't add
  it twice."
- **design** none.

### P-79 · Duplicate invoice warning
- **tier** P2
- **trigger** the parse route's `duplicateWarning` (`ChatView.tsx:706`).
- **today** inline passive badge on the card (`ChatView.tsx:3844`).
- **why** Correct decision (PUNCH-LIST: the blocking prompt caused a loop).
  Recorded so it is not re-made blocking.
- **copy today** "Similar invoice sent recently".
- **design** none.

### P-80 · Template duplicate note
- **tier** P3
- **trigger** same client + same total within 48 h on the template
  (`ChatView.tsx:~3340`).
- **today** inline note above Send; Send still works.
- **copy today** "Heads up — you already made one for {client} at this amount in
  the last 2 days. Send makes a new one."
- **design** none.

### P-81 · Ambiguous client on a save prompt
- **tier** P2
- **trigger** `matchOrCreateClient` returns `ambiguous` while saving a client
  (`ChatView.tsx:~3405`).
- **today** the prompt card closes; an inline bubble says where to go.
- **copy today** "I have more than one client like {name}. Open Clients to save
  the right one."
- **design** none.

### P-82 · Unreadable totals
- **tier** P2
- **trigger** `!isValidTotal` on the card (`ChatView.tsx:4005`).
- **today** inline error block; Send disabled with no other explanation.
- **why** Disabled-with-explanation exists — good — but the copy blames the user.
- **copy today** "Something went wrong reading the amounts. Try rephrasing the
  prices."
- **design** none.

### P-83 · Offline / network failure
- **tier** P1
- **trigger** `navigator.onLine` false or a fetch throw (`ChatView.tsx:1300`,
  `:1520`).
- **today** inline failed bubble; copy differs offline vs online.
- **copy today** "You're offline — that didn't send. Your work is saved." ·
  "Connection hiccup — that didn't go through." · "You're offline — the invoice
  didn't send. Your draft is safe." · `ERROR_MESSAGE.offline` = "No connection.
  Check your signal and try again."
- **states** `Retry` inline.
- **design** none.

### P-84 · Signed out mid-action
- **tier** P1
- **trigger** a save/send with no profile (`ChatView.tsx:1942`, `:2887`).
- **today** inline bubble + auto-redirect to `/login` after 1600 ms.
- **why** Same auto-redirect gap as P-62.
- **copy today** "Let's save your work — sign in to send this invoice." ·
  "Let's save your work — sign in to keep this expense."
- **design** none.

### P-85 · Expense save failures
- **tier** P1
- **trigger** upload or insert error in `saveExpense` (`ChatView.tsx:2900-2970`).
- **today** inline error inside the card (`expenseError`).
- **copy today** "One sec — still loading your account. Give it a moment." ·
  "Couldn't save the photo just now — your expense is still here." ·
  "Couldn't save that expense just now."
- **states** `Saving…` while pending; the card stays so the data is kept.
- **design** none.

### P-86 · Receipt could not be read
- **tier** P2
- **trigger** `prepareReceipt` throws, no total read, or a non-ok receipt
  response (`ChatView.tsx:2765`, `:2855`).
- **today** inline bubble; `ReceiptError` messages are user-written.
- **copy today** "Couldn't read that photo — try taking it again." · "I couldn't
  make out the total on that one. Tell me the amount and I'll log it." ·
  `ERROR_MESSAGE` mapping for 413/415/429/500.
- **design** none.

### P-87 · Voice transcription failure
- **tier** P2
- **trigger** `/api/transcribe` non-ok or a dropped take
  (`ChatView.tsx:3078-3090`).
- **today** inline bubble via `userMessage`; "Didn't catch that" reserved for a
  clean 200 with no text.
- **copy today** "Didn't catch that — try again or type it." ·
  `ERROR_MESSAGE.rate_limit` = "You've hit the limit for now. Try again a little
  later."
- **design** none.

### P-88 · Payment pending / needs attention
- **tier** P1
- **trigger** the offline payment queue has entries for this invoice
  (`InvoiceDetailScreen.tsx:1294`).
- **today** existing component — `PendingPaymentNotice.tsx` (`role="status"` /
  `role="alert"`).
- **why** Money that has not landed must be unmissable and must never be
  silently dropped.
- **copy today** "Payment pending: {money}" · "1 payment waiting to sync" ·
  "{n} payments waiting to sync" · "The invoice stays unpaid until the server
  confirms it." · "{money} needs attention" · "This payment could not be
  recorded." · `Retry` · `Edit` · `Discard`.
- **states** pending (info) and attention (error); retry/edit/discard.
- **design** none.

### P-89 · Invoice-detail share error
- **tier** P1
- **trigger** `sharePdf` failure or a failed status update
  (`InvoiceDetailScreen.tsx:681`, `:694`).
- **today** inline error under the actions row.
- **copy today** "{mapped error} Tap Share PDF to try again." · "Your file was
  shared, but I couldn't update the invoice. Tap Share PDF to try again." ·
  "Couldn't prepare the PDF. Tap Share PDF to try again."
- **design** none.

### P-90 · Estimate action error
- **tier** P2
- **trigger** send / duplicate / extend / title save / line-item save failure
  (`EstimateDetail.tsx`, `actionError`).
- **today** inline error line.
- **copy today** "Couldn't save that change. Please try again." · "Couldn't
  convert this estimate. Please try again." (others from
  `lib/estimates/owner-actions` — **unverified**).
- **design** none.

### P-91 · Attachment upload / load errors
- **tier** P2
- **trigger** any failure in `EstimateAttachments` / `AttachmentsEditor`.
- **today** inline `role="alert"` + a `Retry` under a failed tile.
- **copy today** "Retry" · "Upload failed" · "Couldn't add that image." ·
  "Up to {n} images." · `readableUploadError(e)` (**unverified**).
- **design** `design/estimates/ESTIMATES-DESIGN-SPEC.md`.

### P-92 · Bank write refused
- **tier** P2
- **trigger** non-ok response from the deposits route or a refused receipt add.
- **today** in-sheet toast (`BankToast`) + inline refusal text.
- **copy today** `depositRefusalMessage(body?.error)` (**unverified**).
- **design** `ReviewStack.dc.html`.

### P-93 · Delete failed
- **tier** P2
- **trigger** the delete write rejects after `DeleteConfirmModal` confirmed.
- **today** **none surfaced** — the modal reports nothing; `busy` clears.
- **why** A destructive action that fails silently is worse than one that asks.
  Should reuse the modal's busy/error slot.
- **copy today** none.
- **states** `busy` → `Deleting…`; no error state exists.
- **design** none.

---

## FAMILY: success toast

### P-94 · Invoice sent
- **tier** P2
- **trigger** a completed share + successful mark-sent.
- **today** inline bubble + `SentLedgerRow` chip.
- **copy today** "Sent! I'll notify you if {client} hasn't paid in 2 days." (+
  " You'll also get a notification when {client} pays online." when card pay is
  live) · "All set — your invoice for {client} is sent."
- **states** terminal.
- **design** `design/laptop/MAPPING.md` (Invoices toast).

### P-95 · Downloaded
- **tier** P3
- **copy today** "Downloaded! Send it to {who} however you like. I'll keep an
  eye on it." · "Downloaded — it's saved as a draft. Tap send whenever you're
  ready."
- **design** none.

### P-96 · Estimate live / link actions
- **tier** P3
- **trigger** send, copy, revoke, extend on an estimate.
- **today** toast (`role="status"`, 2.2 s) in the detail screen; `flash` note in
  the chat card.
- **copy today** "Estimate is live. Copy or share the link with {client}." ·
  `Link copied` · `Link deactivated` · "Valid until {date}" ·
  "Clipboard is blocked. Long-press the link to copy it."
- **design** `design/estimates/PUBLIC-PAGE-STATES.md`.

### P-97 · Delete undo toast
- **tier** P2
- **trigger** an invoice/estimate/expense/client/product delete, or stopping a
  recurring expense.
- **today** existing component — `UndoToast.tsx` (6 s, route change dismisses).
- **copy today** "Invoice deleted." · "Estimate deleted." · "Client deleted." ·
  "Item deleted." · "Stopped {vendor}. Logged expenses stay." · `Undo` ·
  `Dismiss`.
- **why** Undo replaces a confirm for P2/P3 deletes; it is NOT a substitute for
  P-06's typed confirm.
- **design** none.

### P-98 · Bank toast
- **tier** P2
- **trigger** a bank card write lands.
- **today** existing component — `BankToast.tsx` (2.4 s, top of the sheet,
  announced once via `sr-only` `role="status"`).
- **copy today** `Added to {day}, totals updated.` (`lib/bank-tracking.ts:336`) ·
  "Ignored. It stays out of your totals." · "Linked to the payment already on
  record." · `depositDoneToast` classification variant
  (`lib/bank-deposits.ts:255-262`, **unverified**).
- **design** `ReviewStack.dc.html`.

### P-99 · Signature copied
- **tier** P3
- **copy today** `Copied` / `Copy link` in `SuccessSheet`.
- **design** `design/estimates/PUBLIC-PAGE-STATES.md`.

### P-100 · Shutter flash (not a popup)
- **tier** P3
- **trigger** a captured photo.
- **today** none — a full-screen white flash (`.onit-shutter`), keyed per
  capture (`ChatView.tsx:4620`).
- **why** Not justified to change; recorded so it is not mistaken for a missing
  confirmation. It is a flash, not a status message — nothing to read or
dismiss.
- **design** `MOTION-SPEC.md` §8.

---

## Shared rules observed

**1. Four popup shapes exist, and they are not interchangeable.**
`PaywallModal` (portal, focus trap, scroll lock, `role="dialog"`),
`DeleteConfirmModal` (typed confirm, `data-kb-fit`), the `PickerSheet` /
`RecordPaymentSheet` / `ReplaceTemplateSheet` bottom-sheet family (portal,
scrim + swipe + Escape, `role="dialog"` / `role="alertdialog"`), and the inline
`div.card` pattern in the transcript. Chat's own prompts (P-01, P-02, P-08,
P-32) are inline cards; the money sheets are portals.

**2. Dismissing is asymmetric and only sometimes safe.**
`RecordPaymentSheet` refuses to close while saving (`savingRef`).
`DeleteConfirmModal` refuses while `busy`. `ReplaceTemplateSheet` treats scrim,
Escape and swipe as *Keep editing* — the safe answer. Chat's inline cards have
no dismissal at all: the question stays until answered (correct for P-01/P-02,
a dead end for P-03 when the template is gone).

**3. Repeat-tap protection is split between refs and state.**
Money paths use synchronous refs (`submittingRef`/`savingRef` in
`RecordPaymentSheet`, `buyRef`/`restoreRef` in `PaywallModal`,
`finalizingRef`/`creatingRef` in Chat, `convertingRef` in `EstimateDetail`).
Chat's inline prompt buttons (P-01, P-02) rely on `phase` **state** only — the
one place CLAUDE.md rule 2's "not only state" is not met.

**4. Every failure names a cause, and the cause vocabulary is centralised.**
`src/lib/errors.ts` owns offline / signed-out / rate-limit / too-large /
unsupported / duplicate / bad-input / not-found / our-end. Chat reuses it for
receipts and voice; the sends add their own four sentences (P-65..P-68).
Nothing says "check your connection" for a non-network error.

**5. Sales copy never occupies a blocked-flow moment.**
One nudge per send (`lib/tip-arbiter`: terms → payouts → alerts → feedback), and
the hard wall only opens when something was actually refused. The soft banner
(P-58) is a flex sibling so it can never cover the composer.

**6. Money confirmations carry the figure; non-money ones do not.**
`RecordPaymentSheet` puts the amount in the primary label
(`Mark paid · $85.00 Zelle`), `PendingPaymentNotice` puts it in the heading,
`DeleteConfirmModal` puts the record name/number in the subtitle. But
P-09 (`Delete?` / `Yes`) and P-14 (convert) carry no figure at all.

**7. "estimate" everywhere on screen.** No popup introduces the word "quote";
the stored kind is only ever mapped through `docNoun()` /
`formatDocNumber()` before display.

**8. Gaps cluster where a flow changed shape late.**
Three of the five worst gaps (P-14 convert, P-16 template ×, P-66
shared-but-not-sent) live in flows added after the popup patterns were set: the
estimate convert bar, the composer template, and the pre-built share. The
older sheet-based paths (record payment, delete) are the consistent ones.

---

## Counts

| family | items | P1 | P2 | P3 |
|---|---|---|---|---|
| confirm | 5 | 3 | 2 | 0 |
| destructive-confirm | 14 | 8 | 4 | 2 |
| picker | 12 | 0 | 5 | 7 |
| form sheet | 15 | 6 | 9 | 0 |
| permission | 7 | 0 | 3 | 4 |
| limit / upgrade | 11 | 3 | 6 | 2 |
| status / error | 29 | 8 | 15 | 6 |
| success toast | 7 | 0 | 3 | 4 |
| **total** | **100** | **28** | **47** | **25** |

Today: existing component 31 · inline text or card 54 · none 15 · native
`window.confirm` / `alert` / `prompt` **0**. The only OS/browser prompts in the
audit are not dialogs the app draws: the native date input behind P-28, the OS
photo picker (P-51) and the browser push prompt (P-52).
