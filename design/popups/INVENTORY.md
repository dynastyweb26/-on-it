# Chat popup inventory (read-only audit)

Scope: the Chat tab (`src/components/tabs/ChatView.tsx`, 4,711 lines) and everything launched from it
(paywall, template sheets, camera, composer menu, share, push), plus the money surfaces a Chat user
reaches next: record payment, bank deposits and matching, delete, convert, estimate signature.
Read first: CLAUDE.md, ONIT-SPEC.md, SECURITY.md, PUNCH-LIST.md. On screen the word is "estimate".

How this was built: grep of `src/` for `window.confirm|alert|prompt` (zero hits: **the app has no native
dialogs**), for every `role="dialog"|alertdialog|status|alert`, `aria-modal`, Sheet/Modal/Toast/Banner/
Paywall component and who mounts it, and for every error and limit string in ChatView and the API routes
it calls. Items I read in full are marked nothing; items I only grepped are marked **unverified** where it
matters. Line numbers are against `origin/main` at `9879bf4`.

## Reading the entries

Tier: **P1** money, irreversible or blocking. **P2** frequent. **P3** rare.
Today: none | inline text | existing component. "States" lists idle / pending / error / repeat-tap
(CLAUDE.md interaction rule 9). Copy is verbatim from source.
Family codes: **CF** confirm, **DC** destructive-confirm, **PK** picker, **FS** form sheet,
**PM** permission, **LU** limit/upgrade, **ST** status/error, **TO** success toast, **NC** nudge card
(a ninth family: the brief lists eight, but the app has six nudge cards that fit none of them).

Existing design in `design/`: nothing in `design/` covers Chat popups. `design/estimates/` covers the
public estimate page states (the signature flow, P-52). `design/laptop/paywall.html` and `tutorial.html`
cover the paywall and tutorial at laptop width only. `design-reference/` holds `chat-screen.html` and
`paywall-mockup.html` (phone, older). Nothing else is designed. The untracked `*.dc.html` files in the
working tree (BankAccounts, ReviewStack, Ledger, Books) are not on `origin/main`; I did not read them.

---

## A. Send and share

### P-01 Send an invoice (one tap)
- Tier P1 · Family CF · Today: none (the OS share sheet is the only gate)
- Trigger: tap "Looks right — send it" → `finalize()` `ChatView.tsx:1873`; button `~3950`. The code says
  "There is no confirm step" (`:650`).
- Why a popup: sends a document to a client and burns an invoice number. The share sheet is native and not
  ours to design; a pre-share summary is the question.
- Data: client, total, deposit due now, due date; source: `draft`, `previewTotals`.
- Actions: primary "Looks right — send it" / "Share invoice" / "Building your PDF…" / "Preparing…" /
  "Pick a client first"; secondary "Download draft"; "Undo last edit"; "Actually, let me change something".
- Copy: `Sent! I'll notify you if ${who} hasn't paid in 2 days.` · `Downloaded! Send it to ${who} however you like. I'll keep an eye on it.`
- States: idle ready · pending `phase==='building'` spinner + disabled · error → P-04, P-05 · repeat-tap
  disabled while `phase!==null`; row reuse via `pendingInvoiceRef` so no duplicate row.
- Design: none.

### P-02 Send an estimate (creates the live link)
- Tier P1 · Family CF · Today: none (no share sheet; the link goes live on this tap)
- Trigger: same button → `settleEstimateSend` `:2557` → `requestEstimateSend` (`lib/estimates/owner-actions.ts`).
- Why: outward-facing and the link is public the moment it is made; "no confirmation bubble for an estimate" (`:2565`).
- Data: client, total, valid-until (`asked` date or server +30 days). Source: `draft.due_date`.
- Actions: "Looks right — send it" · after: "Copy link", "Share", "Revise".
- Copy: `Copy or share the link with ${draft.client_name ?? 'your client'}.` · errors from `sendErrorMessage`:
  `Please sign in again.` · `Too many attempts. Try again in a minute.` · `This estimate is already approved.` ·
  `This estimate has already been converted.` · `This estimate can no longer be sent.` ·
  `Couldn't create the link. Nothing was shared.`
- States: pending "Sending…" · error → failed bubble + Retry (P-24) · repeat-tap disabled.
- Design: none.

### P-03 Shared, but couldn't mark as sent
- Tier P1 · Family ST · Today: inline text (a chat bubble with Retry), `ChatView.tsx:2461`
- Trigger: `navigator.share` succeeded, then `POST /api/invoices/:id/send` failed (`:2454-2464`).
- Why: the client has the document and the app still thinks it is a draft. Retry re-opens the share sheet,
  so a user can share it twice.
- Data: none beyond the message.
- Actions: Retry (icon + "Retry"), `ChatView.tsx:4198-4206`.
- Copy: `Your file was shared, but I couldn't mark it as sent. Tap send to try again.`
- States: error bubble shakes (`onit-shake`) · pending Retry icon spins, label "Retrying" · repeat-tap
  `retryingRef` synchronous guard (`:2592`).
- Design: none.

### P-04 Share sheet did not open
- Tier P2 · Family ST · Today: inline text, `:2440-2449`
- Trigger: `sharePdf` returns `failed` (`lib/pdf/share.ts:19`); iOS `NotAllowedError` is the common case.
- Why: not justified as a popup; calm inline line plus a changed button label ("Share invoice") works.
- Copy: `Your ${docNoun(...)} is ready. Tap Share ${docNoun(...)} to send it.` · other:
  `The share sheet didn't open (${r.name}). Your draft is safe. Tap send to try again.`
- States: as P-03. Cancel of the share sheet is silent by design (`:2436`).
- Design: none.

### P-05 Save failed while sending (offline or server)
- Tier P1 · Family ST · Today: inline text with Retry, `:2148, :2172, :2250, :2394`
- Copy: `Couldn't save that invoice just now. Your draft is safe.` · `You're offline — the invoice didn't send. Your draft is safe.` ·
  `Couldn't save your changes just now. Your draft is safe.` · `You're offline — your changes didn't save. Your draft is safe.` ·
  `Couldn't finish that one. Your draft is safe.`
- States: repeat failure of a retry leaves the existing bubble instead of stacking a new one (`upsertFailure`,
  `lib/chat/failures.ts`).
- Design: none.

### P-06 Signed out at send
- Tier P1 · Family ST · Today: inline text, then auto-redirect, `:1942` (invoice), `:2892` (expense)
- Why: a blocking state with a timed redirect (1.6 s) and no way to cancel or read it twice.
- Copy: `Let's save your work — sign in to send this invoice.` · `Let's save your work — sign in to keep this expense.`
- States: `phase='redirecting'` left set so the card stays disabled · no cancel.
- Design: none.

### P-07 Draft pre-build failed / invalid total
- Tier P3 · Family ST · Today: inline text `:4027`
- Copy: `Something went wrong reading the amounts. Try rephrasing the prices.`
- States: send disabled (`!isValidTotal`).

### P-08 Duplicate-invoice hint
- Tier P2 · Family ST · Today: passive badge on the card (`duplicateHint` `:645`); PUNCH-LIST: blocking warning was
  removed in `71ed4c1` on purpose (loop). Not a popup; do not reintroduce a blocker.
- Copy: unverified (badge text not read).

---

## B. Draft and document editing

### P-10 Close × on a template (discards the work)
- Tier P1 · Family DC · Today: **none**
- Trigger: `aria-label="Close template"` `template/TemplateCard.tsx:222` → `closeTemplate` `ChatView.tsx:3232` →
  `discardTemplateRow` `:3217`.
- Why: it throws away a typed estimate or invoice (client, lines, extra info, tax, attachments) and
  **soft-deletes the pre-built draft row** (`deleted_at`). The expense template already asks first (P-11).
- Data to show: client name, line count, total. Source: `templateDraft`.
- Actions: none today. Proposed vocabulary reuses P-11: "Keep editing" / "Discard".
- States: idle · pending (row soft-delete is fire-and-forget) · error swallowed `.then(()=>undefined, ()=>undefined)` ·
  repeat-tap harmless.
- Design: none.

### P-11 Discard this expense? / Replace unfinished template
- Tier P2 · Family CF · Today: existing component `template/ReplaceTemplateSheet.tsx` (role `alertdialog`, scrim,
  Escape and swipe-down all mean Keep), mounted `ChatView.tsx:4475` (discard expense) and `:4481` (replace).
- Trigger: Cancel on an expense template with anything entered (`:4506`); or "New invoice/estimate" from "+"
  when a saved template has a client or named item (`startNewTemplate` `:3176`).
- Actions: "Keep editing" (primary, autofocus) / "Discard" or "Start new" (outline).
- Copy: title `Discard this expense?` · or `unfinishedTitle(saved)` from `lib/template-store`.
- States: idle · pending none (instant) · error none · repeat-tap closes on first tap.
- Design: this is the one existing confirm design; reuse it.

### P-12 "This would change INV-…" (change guard)
- Tier P1 · Family CF · Today: inline card in the message list, `:4357`
- Trigger: a parse would rewrite the linked document (`setPendingChange` `:1480`).
- Actions: `Update ${formatDocNumber(...)}` (primary) / `Start a new invoice` (link).
- Copy: `This would change ${formatDocNumber(pendingChange.kind, pendingChange.no)}. Update it, or start a new invoice?`
- States: disabled while `phase!==null`; no pending label.
- Note: the secondary says "invoice" even for an estimate. Check against the copy rules when redesigning.

### P-13 Which client is this for? (duplicate or close-match client)
- Tier P1 · Family PK · Today: inline card `:4374`, scrolls into view (`scrollToClientQuestion` `:395`)
- Trigger: `finalize` paused on a name close to saved clients (`matchOrCreateClient`, `:2035`).
- Data: candidate client names (`clientChoice.candidates`), typed name.
- Actions: one primary button per candidate (the client name) / `New client “${clientChoice.typed}”`.
- Copy: `Which client is this for?` · send button reads `Pick a client first`.
- States: send disabled while open · repeat-tap `if (!clientChoice || phase) return` · no error state shown.

### P-14 Revise a locked document
- Tier P1 · Family CF · Today: none (button is the action), `ChatView.tsx:4005`, `reviseInvoice` `:3750`
- Why: makes an editable copy; the original stays. Reversible, so confirm not needed, but the helper line is the only warning.
- Copy: `Opens an editable copy as a new invoice. The original stays as it was.` · estimate:
  `Makes a new estimate you can edit. This one and its link stay as they are.` · lock refusal (`:199-205`):
  `That invoice was already sent, so it's locked. Start a new invoice, or tap Revise on the card to edit a copy.`
- States: pending 150 ms exit animation, `revisingRef` guard.

### P-15 Client picker sheet (+ New client form)
- Tier P2 · Family PK · Today: existing component `template/PickerSheet.tsx` via `TemplateSheets.tsx` (`ClientSheet`)
- Trigger: tap the client slot `TemplateCard.tsx:229`.
- Data: saved clients, "Used before · not saved" history rows, A–Z rail; source: `clients` + usage RPC.
- Actions: "Cancel" · "New client" (pinned) · row tap; "Use '{q}'" row for a one-off.
- States: Escape, scrim, swipe-down close; while the new-client form is open they go back to the list
  (`PickerSheet.tsx:80`). Errors in the inline form: unverified.

### P-16 Item picker sheet
- Tier P2 · Family PK · Today: `PickerSheet` via `ItemSheet`. Title `Product or service`, button "New product or service".

### P-17 Keypad sheet (price, quantity)
- Tier P2 · Family FS · Today: `template/KeypadSheet.tsx`. Titles `Price` / `Quantity`; buttons "Cancel", "Set price", "Set quantity".

### P-18 Tax sheet
- Tier P2 · Family FS · Today: `template/TaxSheet.tsx`. "Cancel" / "Done" / destructive-looking "Remove tax"
  (immediate, no confirm; reversible by re-entering). The chat card has a separate inline tax row (`ChatView.tsx:3903`,
  "+ Add tax", `aria-label="Remove tax"`): two UIs for one value.

### P-19 Extra info sheet (dates, notes, deposit)
- Tier P2 · Family FS · Today: `template/ExtraInfoSheet.tsx`. "Cancel" / "Done". Placeholder
  `Due Friday, job address, notes for the client…` (estimate: `Valid for 14 days, job address, notes for the client…`).
  Cancel discards the edit silently.

### P-20 Deposit controls on the chat card
- Tier P1 · Family FS · Today: inline controls `ChatView.tsx:3860-3885` (select + `DepositValueInput`), no sheet.
- Why: deposit changes what the client is asked to pay now. A bad value (e.g. 400 %) has no stated error here: **unverified**
  (`DepositValueInput` / `lib/deposit-input.ts` not read in full).
- Copy: `Deposit required` · note placeholder `Deposit due before materials are ordered. 3-5 day lead time.`

### P-21 Delete line item
- Tier P2 · Family DC · Today: none; immediate (`LineItemsEditor.tsx:426`, `aria-label` `Delete line ${i+1}`).
  Recovery: "Undo last edit" under the card (`ChatView.tsx:4098`, `undoLastEdit` `:3594`, 20-step history).
- Why not justified as a popup: undo exists. Gap is discoverability only.

### P-22 Add or remove an attachment
- Tier P1 (remove) / P3 (add) · Family FS (add), DC (remove)
- Add: existing component sheet "Add attachment" with "Take photo" / "Use your camera" (`AttachmentsEditor.tsx:175-203`),
  limit text `Up to ${ATTACHMENT_MAX} images.`, failure `Couldn't add that image.` in `role="alert"`.
- Remove: **none**. The × (`aria-label="Remove attachment"` `:122`) deletes the stored file, deletes the row and renumbers
  (`removeSavedAttachment` `ChatView.tsx:893`); errors are swallowed (`catch { /* the optimistic removal already took it off screen */ }`).
- States: add pending "Adding…".

### P-23 Undo last edit
- Tier P3 · Family TO (should be) · Today: plain text button `Undo last edit`, disabled when history empty.

### P-24 Failed message + Retry
- Tier P1 · Family ST · Today: failed assistant bubble plus Retry control (`:4185-4206`, `retry` `:2589`)
- Copy: `Connection hiccup — that didn't go through.` · `You're offline — that didn't send.` · `You're offline — that didn't send. Your work is saved.`
- States: shake on live failure only (restored messages never shake) · Retry spins · repeat-tap guarded synchronously.
- Design: MOTION-SPEC §7 covers the shake.

### P-25 New chat (header) and History
- Tier P1 (new chat) / P3 (history) · Family CF / PK
- New chat: **none**; comment `:1086` says "No confirmation: history makes it recoverable". History keeps only the last 5
  conversations (`:4665`), and the draft invoice row from the old chat is unlinked, not deleted (`pendingInvoiceRef.current = null` `:1112`).
- History: existing inline sheet (`role="dialog"`, `aria-label="Recent conversations"`, `ChatView.tsx:4653`, trigger `:996`).
  Copy: `Recent conversations` · `Nothing here yet — your last 5 conversations will show up.` · chips `Sent` / `Draft`.
  Scrim click closes; no Escape handler: **unverified**.

---

## C. Money and records

### P-30 Record payment sheet
- Tier P1 · Family FS · Today: existing component `invoice-detail/RecordPaymentSheet.tsx`
  (`role="dialog" aria-label="Record payment"`), launched from invoice detail (`InvoiceDetailScreen.tsx`), not from Chat.
- Data: balance, deposit remaining, method, date. Source: invoice totals.
- Actions: `Mark paid · ${money(balance)} ${methodLabel}` · `Record deposit · …` · `Save ${money(amount)}` · `Enter an amount` · "Close".
- Copy: `Record payment` · `Paid with` · `Date received` · `Other day` · `Amount too high` · `Pays it off in full` ·
  `Leaves ${money(...)} due` · `Type the amount received`
- States: error `role="alert"` with the real cause (signed out / offline / server, `:136-138`) · pending: unverified · repeat-tap: unverified.

### P-31 Payment needs attention
- Tier P1 · Family ST · Today: `invoice-detail/PendingPaymentNotice.tsx` (`role="status"` / `role="alert"`).
- Copy: `${money(e.amount)} needs attention` · `This payment could not be recorded.`

### P-32 Bank review popup (deposit and expense matching)
- Tier P1 · Family FS · Today: existing components `bank/BankSheet.tsx` (dialog), `ReviewStack.tsx`, `ReviewCard.tsx`,
  mounted by `BankTrackingProvider` (shell-level; holds off while the mic owns the screen `ChatView.tsx:652`, and while any
  other dialog is open `BankTrackingProvider.tsx:225`).
- Actions seen: "Add to record" · `Don't add` · `Already recorded` · Fix / Keep pair. Receipt upload happens at "Add to record", not at tap.
- Copy seen: `Possible match` · `Receipt attached` · `Couldn't read that photo. Try another one.`
- States: error `role="alert"`. Everything else here is **unverified**: I did not read `ReviewStack.tsx` (710 lines) in full.
  PUNCH-LIST has the item history.

### P-33 Deposit classification card
- Tier P1 · Family PK · Today: `bank/DepositCard.tsx`, `PaymentPicker.tsx`.
- Copy: `What is this deposit?` · `An existing payment` / `Link it to one you already logged` ·
  `A new payment for an invoice` / `Marks the invoice paid` · `Other money received` / `Not from an invoice` ·
  `Choose an invoice` · `Which payment is this deposit for?` · button `Save` / `Saving…` / `Waiting for the bank`.
- Why a popup: "Marks the invoice paid" is money state. No confirm beyond the card; error `role="alert"` via `depositRefusalMessage`.

### P-34 Bank toast
- Tier P3 · Family TO · Today: `bank/BankToast.tsx` (`role="status"`, tappable pill, `aria-label="Dismiss message"`).

### P-35 Convert estimate to invoice
- Tier P1 · Family CF · Today: none. `invoice-detail/ConvertQuoteBar.tsx:50` button "Convert to Invoice" → "Converting…".
  Creates an invoice and locks the estimate (server code `converted`). No confirm, no summary. Error state: unverified.

### P-36 Delete an invoice or estimate
- Tier P1 · Family DC · Today: existing `DeleteConfirmModal.tsx` (role dialog) + `UndoToast.tsx`, used in
  `InvoiceDetailScreen.tsx:1315`, `ExpensesPane.tsx:430`, `clients/[id]/page.tsx:188`. Typed confirm for sent or paid records
  (`requiresTypedConfirm`): unverified how it asks.
- Copy: `Delete ${label}?` · `Are you sure you want to delete this ${label.toLowerCase()}? It will be removed from your list and Books totals.` ·
  `This record has been ${status}. Deleting it will remove its total from your Books income totals.` · `Cancel` · `Delete` / `Deleting…`
- Undo: `${Estimate|Invoice} deleted.` · `Undo`. This is the best-built destructive flow in the app; reuse it for P-10.

### P-37 Log an expense from a receipt
- Tier P1 · Family FS · Today: existing `ExpenseCard.tsx` (inline, not modal; or in the composer slot from "+").
- Actions: "Save expense" / "Saving…"; `aria-label="Cancel expense"`.
- Copy: `Scanned from receipt` · `From your message` · `Add what you bought (optional)` · saved: `Got it — ${money(amount)}${where}, filed under ${category}.`
  · cancel: `No problem — tell me what it should say, or send another photo.`
- States: error `Couldn't save that expense just now.` and `Couldn't save the photo just now — your expense is still here.` ·
  save is never automatic (`:2760`).

---

## D. Receipts, camera, mic, push

### P-40 Camera blocked screen
- Tier P2 · Family PM · Today: existing `camera/ReceiptCamera.tsx:421` (`role="dialog" aria-label="Camera unavailable"`), full screen.
- Actions: "Choose from photos" / "Try again" / "Close". Copy from `lib/receipt-camera.ts`:
  `Camera access is off` · `On It can’t take the photo until you allow the camera. Open Settings, find On It, and turn Camera on — then come back and try again.` ·
  `The camera needs a secure page` · `This browser can’t use the camera` · `The camera stopped` · `No camera available`.
- Flagged behind `IN_APP_CAMERA`. When off, the OS camera input opens directly (no popup).

### P-41 In-app camera sheet
- Tier P2 · Family FS · Today: `ReceiptCamera.tsx:456`, aria `Photograph a receipt`; controls `Take the photo`, `Close camera`,
  `Choose a receipt from photos instead`, `More camera options`.

### P-42 Receipt photo problems
- Tier P2 · Family ST · Today: inline chat bubbles, `ChatView.tsx:2765, 2858, 2777`; copy from `lib/receipt.ts`:
  `That photo's in a format I can't read. Try taking it again with the camera.` · `Couldn't open that image.` ·
  `That file came through empty — try again.` · `Couldn't read that image — try another photo.` ·
  `I couldn't make out the total on that one. Tell me the amount and I'll log it.` · duplicate:
  `You already logged this receipt — ${money} on ${when}. I didn't add it twice.` ·
  `You've already logged this receipt — I didn't add it twice.`
- Server (`api/parse-receipt/route.ts`): `That photo is too big — take it again.` · `That file isn't a photo I can read.` ·
  `That's today's receipt limit — it resets tomorrow. You can enter details manually in the meantime.` · `One sec — give me a moment to catch up.`
- States: `phase='preparing'` shows `Getting that photo ready…` then `Reading your receipt…` (`role="status"`).

### P-43 Mic permission denied
- Tier P2 · Family PM · Today: inline text above the field, `role="status"`, `ChatView.tsx:4551`, copy `:286-299`.
- Copy: `Mic access is off. To use voice, turn on Microphone for On It in your iPhone Settings, or type instead.` ·
  `Mic access is off. To use voice, allow the microphone for this site in your browser settings, or type instead.` ·
  `Couldn't use the mic. You can type instead.`
- States: no dismiss control and no retry; clears on the next voice start (unverified).

### P-44 Voice take failures and limits
- Tier P2 · Family LU/ST · Today: chat bubbles, `ChatView.tsx:3056-3092`. Server copy (`api/transcribe/route.ts`):
  `One sec — slow down a moment.` · `That's the free voice previews used up — create your free account to keep talking to On It.` ·
  `Voice is busy today — create your free account to keep using it. It's instant.` ·
  `That's today's voice limit — it resets tomorrow. You can type in the meantime.` · client: `Didn't catch that — try again or type it.`
- Guest cases auto-redirect to /login after 1.6 s (same as P-06).

### P-45 Payment-alerts card (push permission)
- Tier P2 · Family NC/PM · Today: inline card `ChatView.tsx:4414`; "Yes" calls `subscribeToPush()` which raises the browser permission.
- Copy: `Want a notification when ${client} pays online?` / `Want a nudge if ${client} hasn't paid in 2 days?` · "Yes" · "Not now" ·
  result `You're set. …` · `Couldn't turn that on. You can switch payment alerts on any time in Settings.`
- Denied state: `pushAvailability()` returns `denied`, and nothing is shown. No way back in from Chat.

### P-46 Composer "+" menu
- Tier P2 · Family PK · Today: `ComposerMenu.tsx` (role `menu`, scrim, Escape). Items: `Voice` / `Say it, On It writes it`,
  `New invoice`, `New estimate`, `Record expense` (each `Guided template`).

---

## E. Limits, paywall, upgrade

### P-50 Paywall modal from Chat
- Tier P1 · Family LU · Today: existing `PaywallModal.tsx` (role dialog, focus trap, Escape, "Not now"), mounted `ChatView.tsx:4705`.
- Triggers: invoice send over cap `:1973`; DB trigger `PAYWALL_LIMIT_*` `:2126`; receipt over cap `:2800, :2837`; save expense `:2939`;
  recurring prompt `:3329`. Variants: invoice, expense, estimate, recurring, reports, recaps, winback.
- Copy: reason pills `You’ve used your 3 free invoices` / `5 free expenses` / `3 free estimates` ·
  `Start 14-day free trial` / `Subscribe — $9.99/month` · `One sec…` · `Purchase restored.` · `Continue` · aria `Not now`.
- States: `checking` (CTA disabled until access answers) · busy · notice line · fails open if `/api/access` is unreachable.
- Design: `design/laptop/paywall.html` (laptop only); paywall mockup in `design-reference/`.

### P-51 Over-cap reply (card shows, nothing saved)
- Tier P1 · Family LU · Today: inline text, `overCapReply` `:137`, set at `:1366`.
- Copy: `Here's your invoice. You've used your ${n} free invoices, so start your free trial to send it.` (estimate and expense variants).
- Why: it tells the user the document exists but is not saved. A wall with the document visible behind would say it better.

### P-52 Soft-prompt upgrade nudge
- Tier P2 · Family NC · Today: `ChatNudgeCard` under the card `ChatView.tsx:4330` → `PaywallModal` with `reason` (`:4706`);
  also the shell banner `SoftPromptBanner.tsx` (`AppShell.tsx:781`).
- Copy (`lib/soft-prompts.ts`): `${left} free ${kind} left` / `You’ve used ${used} of ${limit} free ${plural}. Unlimited ${plural} come with a plan.` / "See plans" ·
  `Your estimate was approved` / "Turn it into an invoice" · `First payment received` · `Pick up where you left off`. Second button "Not now".

---

## F. Tips and nudge cards (Chat)

### P-60 Add your terms
- Tier P3 · Family NC · `ChatView.tsx:4432`. `Add your terms` / `Add terms` / `Not now`. Rules `lib/terms-prompt.ts`.
### P-61 Feedback ask
- Tier P3 · Family NC · `:4448`. `Got a minute?` / `Tell us what's working or what isn't.` / `Tell us` / `Not now`. Snooze logic `lib/feedback.ts`.
### P-62 Connect payments (empty chat and post-send)
- Tier P3 · Family NC · `:4125` and `:4160`. `Connect a payment processor to your invoices` / `Set up payments` / `Not now`.
### P-63 Save client / product / recurring
- Tier P2 · Family NC · `SavePromptCard.tsx`, floats above the composer, no scrim (`ChatView.tsx:4521`).
- Copy: `Save ${name} to your clients?` · `Save ${name} (${price}) to your products & services?` ·
  `${name} charged ${money} again. Make it a ${cadence} recurring expense?` · "Not now" · "Save" / "Make recurring" ·
  confirmations `Saved ${name} to Clients.` · `Done. ${name} is now a …recurring expense. I'll log …`
- States: `idle|saving|error|done|out` · error shows `res.message` in the card · repeat-tap disabled while busy.
### P-64 Tip arbiter
- One nudge per send (`lib/tip-arbiter.ts`): terms > payouts > alerts > feedback. A rule, not a popup.

---

## G. AI answers and errors

### P-70 Question answers (ask route)
- Tier P2 · Family ST · Today: assistant bubble, `ChatView.tsx:1289-1316`, copy `lib/ask-client.ts`, `lib/tools/reply.ts`.
- Copy: `You're signed out. Sign in, then ask me again.` · `Too many questions in a row. Wait a moment, then tap Retry.` ·
  `That lookup didn't work on our end. Tap Retry.` · `I can't look that up yet. I can tell you who hasn't paid you.` ·
  `I couldn't look that up just now. Ask me again in a moment.`
- Empty result: unverified. Thumbs or feedback on an answer: **none found**.

### P-71 Feedback intent reply
- Tier P3 · Family ST · `lib/feedback-intent.ts:52`. `I'd love to hear it. Tap below and tell us. We read every one and reply by email if there's something to say.`

### P-72 Parse errors and rate limit
- Tier P2 · Family ST · bubbles. `One sec — slow down a moment.` · `Say that again?` · `Let’s start that one fresh.` ·
  `Something glitched on my end. Say that one more time?` · `Say that again?` is also the fallback reply (`:1373`).
- Generic mapper `lib/errors.ts`: `No connection. Check your signal and try again.` · `You've been signed out. Sign in again to keep going.` ·
  `You've hit the limit for now. Try again a little later.` · `Something broke on our end, not yours. Try again in a minute.` (plus 6 more).

### P-73 Duplicate client name or invoice number
- Duplicate client: P-13. Duplicate invoice number: no UI. The server's 23505 read-back hands back the existing row on a retry
  (`:2121`, comment `:2588`). `errors.ts` maps 23505 to `That name is already taken. Use a different one.` for forms. Chat UI unverified.

---

## H. Estimate signature, link, tutorials

### P-80 Estimate link: Copy and Share
- Tier P3 · Family TO · `estimates/EstimateLinkActions.tsx`. `Link copied` · `Clipboard is blocked. Long-press the link to copy it.` (`role="status"`).

### P-81 Approve estimate (client side, public page)
- Tier P1 · Family FS · Not in Chat (the client opens the link). `estimate/SignSheet.tsx` (dialog): `Type your name below to sign` ·
  `Draw your signature in the box` · `Your typed name is your signature` · `Approve estimate`. `SuccessSheet.tsx`: `Signed by` ·
  `Save this link. It’s your copy of the signed estimate.` · `Copy link`. Designed: `design/estimates/`.

### P-82 Tutorial, coach marks, tour picker
- Tier P3 · Family NC · `components/tutorial/*` (full-screen `TutorialHost`, `CoachMarks`, `TourPicker`), copy in `components/tutorial/data.ts`
  (e.g. `Meet your assistant` / `Tell On It what you did in plain words. It writes the invoice for you.`; `Snap a receipt`).
  Camera tutorial gate `lib/camera-tutorial.ts`. **Unverified:** I did not read the 866-line `TutorialOverlay.tsx`, nor the onboarding page popups
  (`src/app/onboarding/page.tsx:608-620`). Designed: `design/laptop/tutorial.html`, `design-reference/On It Tutorials.html`.

### P-83 Other loading status lines
- `On It is thinking…` · `Reading your receipt…` · `Getting that photo ready…` (`role="status"`, `:4463`). Not popups; keep inline.

---

## Families and the shared rules

| Family | Items | Component today |
|---|---|---|
| CF confirm | P-01, P-02, P-11, P-12, P-14, P-25, P-35 | `ReplaceTemplateSheet` for two; inline cards for two; **none** for the rest |
| DC destructive-confirm | P-10, P-21, P-22 (remove), P-36 | `DeleteConfirmModal` + `UndoToast` (P-36 only); **none** for the others |
| PK picker | P-13, P-15, P-16, P-25 (history), P-33, P-46 | `PickerSheet`, inline card, `ComposerMenu` |
| FS form sheet | P-17, P-18, P-19, P-20, P-22 (add), P-30, P-32, P-37, P-41, P-81 | `useSheetDrag` sheets, `RecordPaymentSheet`, `BankSheet` |
| PM permission | P-40, P-43, P-45 | camera screen; mic as inline text; push as nudge card |
| LU limit/upgrade | P-44, P-50, P-51 | `PaywallModal`; inline text |
| ST status/error | P-03–P-08, P-24, P-31, P-42, P-70–P-73, P-83 | chat bubbles + Retry; inline text |
| TO success toast | P-23, P-34, P-80 | `UndoToast`, `BankToast`, a one-line `role="status"` |
| NC nudge card | P-45, P-52, P-60–P-64, P-82 | `ChatNudgeCard`, `SavePromptCard`, `SoftPromptBanner` |

Shared rules observed in the code:
1. **No native dialogs anywhere.** Keep it that way.
2. Sheets share one behavior: portal to `body`, `role="dialog"`/`alertdialog` + `aria-modal`, scrim, Escape, swipe-down via `useSheetDrag`;
   dismissing means the safe choice ("Keep editing", "Cancel").
3. The safe button is the filled one and gets `autoFocus` (`ReplaceTemplateSheet`). Destructive is outline. Delete is the only red.
4. Errors name the real cause (offline, signed out, rate limit, our end), through `userMessage()` in `lib/errors.ts`.
5. Failures during a send keep the draft and say "Your draft is safe." A failed bubble gets one Retry; a repeat failure never stacks.
6. Taps are guarded by a synchronous ref (`retryingRef`, `revisingRef`), not just state. Success clears the failure.
7. The paywall **fails open** when `/api/access` is unreachable; the DB trigger is the enforcement.
8. Popups yield to each other: the bank popup waits for the mic and for any open dialog; one nudge per send.
9. Recovery is preferred to confirmation (undo history, soft delete, History, Revise copy). The gaps below are where recovery is missing.
10. `quote` never reaches the screen; strings go through `docNoun()`. One exception found: P-12's "Start a new invoice" is shown for an estimate too.

## Counts

Entries: 47 (P-01…P-83 with gaps in numbering; sub-items are folded into their parent).
By tier: P1 = 21, P2 = 18, P3 = 8 (see the Tier line of each entry; P-22 and P-25 count once at their higher tier).
By family (primary): CF 7, DC 4, PK 6, FS 10, PM 3, LU 3, ST 14, TO 3, NC 9. Several entries sit in two families;
the table above lists each where it belongs.

## Five most dangerous gaps (irreversible, no confirmation)

1. **P-10** Close × on a template discards the whole estimate or invoice and soft-deletes its draft row. Only the expense template asks first.
2. **P-02** Sending an estimate creates a public link and marks it sent in one tap, with no share sheet and no confirmation.
3. **P-01 / P-03** One-tap invoice send relies only on the OS share sheet. If the share succeeds and marking fails, the client has it, the app says draft, and Retry shares it again.
4. **P-22** Removing an attachment deletes the stored file and renumbers rows immediately, swallows errors, and has no undo.
5. **P-25 / P-35** New chat drops the live draft with no confirm (History keeps 5) and orphans its draft row; Convert to Invoice locks the estimate with no summary or confirm.

## Not verified

`ReviewStack.tsx`, `BankSheet` internals, `DeleteConfirmModal` typed-confirm, `DepositValueInput` limits, `TutorialOverlay`, onboarding popups,
History sheet Escape, the empty-answer state for questions, `RecordPaymentSheet` pending and repeat-tap, and the exact text of the duplicate-invoice badge.
No app was run; this is a read of source only.
