# On It — Punch List

_Audited from the code on 2026-09-07 (branch `main`). Status is one of **Done**,
**Partial**, **Open**, **Unverified** (can't be determined from the repo alone —
e.g. live DB/runtime state), or **Not Reproducible** (tried to reproduce the
reported symptom and could not). Evidence is `file:line` or a commit hash.
Trust this over ONIT-SPEC.md where they disagree; the spec is stale._

## Invariants

_Properties that must hold. Each has been verified in code, never assumed — if
you touch the relevant area, re-verify rather than trusting this line._

1. **Intent is owned by the draft.** It changes only when the user explicitly
   names the document type (quote/invoice/bill/estimate) and is **never**
   overwritten by a parse. Enforced by `intent_explicit` (`src/lib/ai.ts`) +
   the functional `setDraft` merge in `chat/page.tsx` that keeps the prior
   intent when `intent_explicit` is false. (`11f5c4a`, `6f2dd00`)
2. **RLS is the sole server-side auth boundary.** Row-level security on every
   user-data table (owner-only, scoped to `auth.uid()`) is what actually
   protects data — verified intact by policy review + anonymous REST probes.
   There is no server-side route-gating middleware (the inert one was deleted;
   see the middleware Bug row). The per-page client redirects to `/login` are
   UX only, not a security boundary. RLS is verified, never assumed.

## Bugs

| Item | Status | Evidence |
|---|---|---|
| middleware cookie write-back | **Resolved (deleted)** | The root `middleware.ts` was inert (Next.js loads `src/middleware.ts` only) and relocating it into `src/` caused a signed-in login loop twice (`c2daaa4`→`8392ada`, `2734494`→`353190a`). Per the audit decision (option B), the file was **deleted** rather than fixed: it secured nothing (RLS is the boundary, audited intact), nothing server-side depended on it (every API route calls `getUser()` itself; no server components read the session), and the client guards + RLS cover it. No server-side route gating exists. |
| summary getUser stall | **Open** | `src/app/(app)/summary/page.tsx:52-53` gates on the network `getUser()` with **no** `getSession()` fast-path and **no** timeout — the same stall settings had. The settings fix (`09dcc22`) was never ported here. |
| settings unauthenticated loading | **Done** | `09dcc22` — `src/app/(app)/settings/page.tsx` added a local `getSession()` fast-path that redirects a signed-out user to `/login` instantly instead of hanging on "Loading…". |
| duplicate warning loop | **Done** | Resolved by making the warning non-blocking (`71ed4c1`): the server's `duplicateWarning` signal (unchanged, `src/app/api/parse/route.ts`) renders as a passive gold badge — "Similar invoice sent recently" — on the still-actionable invoice card. No turn is spent and no confirmation is asked, so there is no loop to re-fire. The earlier ack-based approach (`dupAcked` / `finalize` bypass / `pending`) was superseded and removed as dead code in the follow-up cleanup. |
| client name truncation | **Not Reproducible** | Voice repro on 2026-09-07 returned "Cyril" correctly end to end — transcript, parse, and card all intact. The earlier "Cyi" for "Cyril" symptom did not recur. Reopen with a fresh repro if it resurfaces (candidate sites: `src/app/api/transcribe/route.ts`, `src/lib/ai.ts`). |
| voice end-of-turn affordance | **Done** | `56d0c3d` — listening copy now reads "Listening… tap the mic when you're done." so the user knows to tap the mic to have On It process the turn. The recording state was already visually distinct (`.voice-listening` pulse + "Stop and send" aria-label). |
| hardcoded invoice language (greeting/CTA/"ready to send") | **Done** | Greeting made neutral in `d5f9c9d` ("…I'll take care of the rest.", was "…I'll handle the invoice."). The rest were already kind-aware: send CTA "Looks right — send it" (`chat/page.tsx:1549`, `de407ee`); confirm summary + "…is sent" line via `${kind}` (`chat/page.tsx:1020`, `confirmSummary`); preview card title (`chat/page.tsx:1540`); download message names no kind (`chat/page.tsx:1098`). |

## Infra

| Item | Status | Evidence |
|---|---|---|
| turn trace logging | **Open** | Only failure logging exists — `console.error` at `src/app/api/parse/route.ts:94` and `src/lib/ai.ts:118`. No structured per-turn trace (no trace id, no request/response logging). |

## Polish

| Item | Status | Evidence |
|---|---|---|
| splash screen | **Done** | `src/components/Splash.tsx`, mounted at `src/app/layout.tsx:67`; `@keyframes splash-in` at `globals.css:131`; shows once per session (`sessionStorage`). |
| gold ring on selected states | **Done** | `.ring-gold-selected` defined `globals.css:62`; used on template/color/background selections in `settings/page.tsx`. |
| emoji removal incl. AI system prompt | **Done** | 0 pictographic emoji across `src/` (scanned). AI prompt bans them: `src/lib/ai.ts:45` ("no emoji, ever") and `:46` ("Never use emojis anywhere in your replies."). |
| logo size in the 4 PDF templates | **Done** | Each template sizes the logo and shrinks the business name when a logo is present: `src/lib/pdf/templates/index.tsx` heights 128/96/140/128 at `:325`, `:523`, `:574`, `:629`. |
| sidebar invoice template | **Done** | Implemented as "Ledger" (DB key kept as `sidebar`) — `templates/index.tsx:374`, registered `TEMPLATES` `:703`, label `:713`. |

## Features

| Item | Status | Evidence |
|---|---|---|
| voice mode redesign | **Partial / Unverified** | Push-to-talk voice session is implemented inline in chat: `recorderRef`/`MediaRecorder`, `startRecording` (`chat/page.tsx:1378`), `micTap` (`:1428`), transcribe→parse→speak, mic-blocked fallback (`:1424`). The header comment claims a "full-screen voice mode" (`:6`). Functionally present; whether it matches the intended **redesign** can't be confirmed from code. |
| swipe tab nav | **Done** | `src/app/(app)/layout.tsx` — `onTouchStart/Move/End` with `SWIPE_THRESHOLD` (`:22`, `:83-107`); vertical-scroll gesture wins. |
| tutorial walkthrough cards | **Done** | `src/components/tutorial/` — `FirstRunTutorial.tsx`, `SlideCarousel.tsx`, `TutorialReference.tsx`, `slides.tsx`, `persistence.ts`; auto-show gated on onboarded + version in `layout.tsx:53-64`. |
| recurring invoices | **Open** | No implementation. "recurring" appears only in subscription billing copy (`settings/page.tsx:605`, `PaywallModal.tsx:118`). |
| signature capture | **Open** | No implementation. "signature" appears only in Stripe webhook verification (`api/webhooks/stripe/route.ts`). |
| pay page `/pay/[token]` + public card payment route | **Open (deferred)** | No `/pay` route exists and no public card-payment endpoint exists; both deferred. Backend scaffolding is present but **unused**: `get_public_invoice(text,text)` and the invoice token (`gen_invoice_token`) in migration `20260901120000_payment_methods_and_public_invoice.sql`; no app code calls either. |

## Verify

| Item | Status | Evidence |
|---|---|---|
| conversation state persistence across app switch | **Done** | `StoredChat` persisted to `localStorage`; `restoreFromStore()` (`chat/page.tsx:347`) runs on mount, `visibilitychange` (`:455`), and `pageshow` (`:456`); `applyStoredChat` rehydrates messages/draft/ready/pending/dupAcked. |
| retry on failure message | **Done** | `Failure` type (`chat/page.tsx:30`) on `Msg.failed`; failed messages render an icon retry button (`:1504-1519`); `retry()` (`:1128`) re-runs `send`/`finalize` and replaces the failed bubble in place (`emitResult`, `:68`). |
| migration 003 applied | **Done** | Applied via the Supabase SQL Editor on 2026-09-07. File: `supabase/migrations/003_relax_website_check.sql` — drops the http(s):// check, re-adds a `char_length(...) <= 200`-only constraint, so bare domains (e.g. `vtcprojects.com`) are accepted. |

## Open — logged 2026-09-15 (product review)

_Newly logged this date. Items marked "verified 2026-09-15" were confirmed in
code during that audit; the rest are reported symptoms not yet code-verified —
re-verify before acting, per the note under Invariants._

| Item | Status | Evidence |
|---|---|---|
| Protected pages with no signed-out redirect | **Open (UX only)** | `dashboard`, `invoices`, `invoices/[id]`, `expenses`, `vault` have no mount-time auth guard — a signed-out user sees an empty shell instead of being sent to `/login`. RLS protects the data regardless (`dashboard/page.tsx:95` `getUser()` is inside the log-expense handler, not a guard). Guarded pages for contrast: `chat`, `settings`, `summary`, `onboarding`, `reset-password`. Verified 2026-09-15. |
| Narration total disagrees with the card | **Fixed — pending merge** (`fix/money-narration`) | Two causes, both closed. (1) `confirmSummary` summed `qty*unit_price` only — no tax, no deposit — so the spoken confirmation was the bare subtotal; now routed through `calculateInvoiceTotals` with the draft's tax_rate/deposit_type/deposit_value (`02bb51f`). (2) The `/api/parse` `reply` was model-authored and spoken verbatim, free to state any figure; the server now strips any sentence containing a "$" amount and appends one deterministic sentence from `calculateInvoiceTotals`, and the prompt forbids the model from stating amounts (`82ac06d`). Verified 2026-09-15. |
| Follow-up push copy: raw total, stale "mark paid" | **Fixed — pending merge** (`fix/money-narration`) | `api/followups/route.ts` formatted the raw `$${inv.total}` and said "resend or mark paid" — mark-paid is being removed (paid-ness follows the ledger, `20260918000003_paid_status_from_ledger.sql`) and the push has no such action. Now selects `amount_paid`, computes the remaining balance via `roundCurrency`, skips fully-covered invoices, and formats with `money()`: "Invoice #{n}: {money(balance)} still due. Tap to view." (`3d528dd`). Verified 2026-09-15. |
| Chat-requested deposits become line items — root cause: `ExtractResult` has no deposit fields | **Open (own branch)** | `ExtractResult` (`src/lib/ai.ts:10-38`) declares no `deposit_type`/`deposit_value`, and the prompt routes deposit terms into `notes` (`ai.ts:55`), so a spoken "40% deposit" has no structured home and can surface as a line item. The render and summary paths already read `(draft as any).deposit_type`/`deposit_value` (`chat/page.tsx:729-730`, and now `route.ts`), but nothing populates them from the parse. Fixing it spans schema + prompt + route normalization + client draft merge (DB columns already exist: `20260915000000_deposit_support.sql`, `20260916000000_deposits_and_partial_payments.sql`) and needs manual testing — no test runner. Do it on its own branch, not folded into the narration fix. Verified 2026-09-15. |
| PDF date format mismatch | **Open (unverified)** | The PDF mixes date formats within one document (e.g. `9/13/2026` vs. `2026-10-13`). Reported 2026-09-15. |
| Request-balance PDFs never archived to the Vault | **Open (unverified)** | Balance-request PDFs are generated but not written to the Vault archive like other invoice PDFs. Reported 2026-09-15. |
| Header: show project total as a subline under "due now" | **Open (enhancement)** | The header shows the due-now amount; add the full project total as a subline beneath it. Reported 2026-09-15. |
| `enforce_free_invoice_limit` counts soft-deleted rows | **By design (anti-abuse)** | `20260724154509_enforce_free_invoice_cap.sql:73-75` counts all `kind='invoice'` rows with no `deleted_at` guard, so deleting an invoice cannot free space under the free cap. This is intentional — the cap is an anti-abuse limit. `src/lib/access.ts` deliberately does **not** filter `deleted_at` either, so the client-side count matches the DB trigger. Verified 2026-09-15. |
| Nine duplicate `money()` helpers | **Open** | Nine `money()` definitions: one canonical export (`src/lib/financials.ts:30`) plus eight inline copies — `dashboard/page.tsx`, `expenses/page.tsx`, `invoices/page.tsx`, `invoices/[id]/page.tsx`, `summary/page.tsx`, `pdf/summary-template.tsx`, `pdf/templates/index.tsx`, and `components/DateDivider.tsx`. The `chat/page.tsx` copy was dropped onto `financials.money()` with the narration fix (`02bb51f`, `fix/money-narration`). Consolidate the rest. Verified 2026-09-15; count updated 2026-09-15. |
| No test runner configured | **Deferred** | `package.json` scripts are only `dev`/`build`/`start`/`lint`; no jest/vitest/playwright in deps. Money logic (`calculateInvoiceTotals`, the narration sentence-stripping) is covered by typecheck + manual reasoning only. Adding a runner is deferred — flagged so the deposit-fields work above lands knowing there is no regression net. Verified 2026-09-15. |
| Dead space on the final PDF page | **Open (unverified)** | The last page of the generated PDF carries excess trailing whitespace. Reported 2026-09-15. |
| PDF font bundling (from `16621b2`) | **Deferred** | Inter base + Playfair for Ledger via `next/font`. Restyles all four templates, so needs a visual pass on each, including multi-page Ledger. Must await `document.fonts.load()` for Playfair before html2canvas capture, or the first render falls back to Times. PNG (`a957431`) already on main, dropped. |
| Unmerged work to port | **Open** | Ported pending merge: soft-delete + back nav (Jules `2ef8490`) on `feat/soft-delete-backnav`; deductible removal + date dividers (`f76f8fc`, `93b5288`, `7225f75`) on `feat/books-date-dividers-port`; loading skeletons on `feat/skeleton-loading-port` (dashboard Books-totals skeleton + chat restore skeleton only — `6d1d44d` invoice-list and `2f194f6` invoice-detail were **dropped**, already on `main`). **`feat/invoice-pdf-pagination` is retired** — `a957431` (PNG) already on `main`; `16621b2` (font bundling) deferred to its own row above. The swipe threshold/velocity tuning from `2ef8490` is **dropped** — not ported by decision. Reported 2026-09-15; confirm each branch before porting. |
| Intermittent multi-second scroll/touch freeze | **Open — needs investigation** | App becomes unresponsive to scroll/touch for seconds, intermittently; got more frequent around when `feat/skeleton-loading` was built. **Not caused by the skeletons** (they are presentational, self-limiting, loading flags all clear in `finally`, no effects without cleanup, no touch-blocking CSS — audited 2026-09-15). Suspects to investigate: the layout tab-swipe `onTouchMove` handler, `SwipeableRow`, and heavy per-render effects. Needs its own investigation. |
| Delete test invoice INV-0016 from Cyril's account | **Open (manual, live DB)** | One-time cleanup: remove test invoice `INV-0016` from Cyril's account once soft-delete ships. Live-DB action, not code. Reported 2026-09-15. |

## Open — logged 2026-09-15 (tax-rate + chat/expense audit)

_Tax-rate unit traced end to end; the chat/expense items are reported symptoms,
some code-verified during the audit (marked). Re-verify before acting._

| Item | Status | Evidence |
|---|---|---|
| tax_rate parsed as a fraction → "Tax (0.08%)", $0.40 on $500 | **Fixed — pending merge** (`fix/tax-rate-unit`) | The prompt gave no unit, so the model returned `0.08` for "8 percent"; every reader treats tax_rate as percent (`financials.ts:62` `rate/100`; PDF label `` `Tax (${d.taxRate}%)` `` `pdf/templates/index.tsx:223`,`:523`). Canonical unit = **percent**. Fixed at the AI boundary only: prompt rule that tax_rate is a percent number, set only when stated (`b253b89`); route nulls a value outside `[0,100]`, no `*100` heuristic (`6e75fb6`). **Existing rows:** production is 0/77 with `tax_rate>0`, so nothing to repair today; detection query for the suspected-fraction set (review manually, do NOT blind-`*100` — a real 0.5% lives in `(0,1)`): `select id, subtotal, tax_rate, tax_amount, total from invoices where tax_rate > 0 and tax_rate < 1;`. Verified 2026-09-15. |
| No manual tax field on the card or detail page | **Open** | tax_rate has no UI writer anywhere — not on the chat preview card (only a deposit control, `chat/page.tsx:1645-1666`) nor on the invoice detail edit page (`invoices/[id]/page.tsx` edits line items + deposit, never tax_rate). The AI is the sole origin, so a misparsed or unwanted rate can't be corrected or cleared by hand. Add a tax input to at least the detail page. Verified 2026-09-15. |
| `buildRenderData` computes tax inline instead of `calculateTaxAmount` | **Open** | `chat/page.tsx:718-720` hand-rolls `taxAmount = Math.round(subtotal * taxRate) / 100` and `total = subtotal + taxAmount`, duplicating `financials.calculateTaxAmount`/`calculateInvoiceTotals` (which the very next lines then call at `:729`). Consolidate onto the helper so tax is derived one way only. Verified 2026-09-15. |
| "What's the total?" gets no number | **Open** | The AI is now barred from stating amounts (`ai.ts:47`), but nothing answers a total question deterministically — a user asking "what's the total?" gets a reply with no figure. The server should detect a total/balance question and answer it from `calculateInvoiceTotals` (same money-sentence machinery as `/api/parse`, `route.ts`). Verified 2026-09-15. |
| Expense reply says "That's logged" before the row is saved, and spells amounts in words | **Open (unverified)** | The expense confirmation copy reads as already-saved before the insert completes (risking a false "logged" on a failed save) and writes amounts as words rather than `money()` figures. Locate the expense reply/confirm path (`chat/page.tsx` expense branch, `parse-receipt`) and make the copy follow the save and use `money()`. Reported 2026-09-15. |
| Expense card needs a visible cancel (X) control | **Open (unverified)** | The expense confirmation card has no visible dismiss/cancel affordance, so a mis-triggered expense can't be backed out from the card. Add an X control on `ExpenseCard`. Reported 2026-09-15. |

## Open — logged 2026-09-16 (PDF capture + migration drift)

_PDF capture bug fixed on its own branch; the migration items are code-verified
during the 2026-09-16 audit. Re-verify before acting._

| Item | Status | Evidence |
|---|---|---|
| Invoice-detail PDFs garbled (overlapping glyphs, collapsed spacing) | **Fixed — pending merge** (`fix/invoice-pdf-capture`) | `invoices/[id]/page.tsx` attached `printRef` to a node nested inside a `transform: scale(0.55)` preview wrapper (`:641-644` pre-fix). html2canvas reads geometry from the transformed (scaled-down) coordinate space while laying glyphs at natural font size → overlap + collapsed spacing in `viewPdf`/`downloadInvoice`/`resend`. Fix splits the concerns: the scaled block is now preview-only (no ref) and a second offscreen (`position:fixed; left:-9999`) unscaled node carries `printRef`, mirroring the clean chat finalize path (`chat/page.tsx:1909`). Chat + expense summary already captured offscreen at natural scale and were unaffected. `elementToPdf` also now awaits `document.fonts.ready` before capture (`lib/pdf/generate.ts:64`), removing the font-metric flake that the chat path masked with a 350 ms settle. Commits `0b71ecd`, `a241337`. |
| Migration drift: 8 local migrations unrecorded remotely; `get_public_invoice` dropped in prod | **Open (P0 — schema integrity, not a live route)** | `supabase migration list` shows 20260905000000, 20260910000000, 20260915000000, 20260916000000, and 20260918000000–000003 applied locally but not recorded remotely (some hand-run in the SQL editor). `public.get_public_invoice` was created by `20260901120000`, redefined by `20260910000000` (deleted_at guard), then `20260918000002` runs an **unconditional `drop function if exists` before its `create`**; if that create failed at hand-apply time (deposit_amount/amount_paid columns not yet present) the function is left dropped — matches the reported prod state. No app path calls it today (no `/pay` route; `/i/[token]` is referral-only, `src/app/i/[token]/route.ts`), so nothing live is broken, but any `supabase db push` or the eventual pay page will fail. Restore drafted (create-only, `set search_path = ''`, grants per `20260901120000`, every referenced column confirmed migration-created) as `20260918000004_restore_get_public_invoice.sql` — **not yet applied**. Verified 2026-09-16. |
| `20260916000000` deposit_type check is a silent no-op | **Open (latent, no live break)** | `20260916000000_deposits_and_partial_payments.sql:3` re-adds `deposit_type` with a wider check (`in ('percent','percentage','fixed','none')`) via `add column if not exists`. Because `20260915000000_deposit_support.sql:3` already created the column with the narrower check (`'percentage','fixed','none'`), the `if not exists` makes the re-add a no-op and the wider constraint is never applied — `'percent'` is not permitted at the DB layer. App writes `'percentage'`, so no live breakage; the constraint the file appears to add is not in force. Verified 2026-09-16. |
| Share sheet "Copy" copies an unusable link | **Open (unverified)** | The native share sheet's Copy action reportedly yields a link that doesn't resolve to a viewable invoice. Consistent with there being no public invoice route (`shareInvoice` shares a File, not a URL — `lib/pdf/generate.ts:403`; see the migration-drift row). Needs a repro to pin down what the OS is actually copying (file URI vs. a stale/blob URL). Reported 2026-09-16. |

## Open — logged 2026-09-16 (Jules review verdicts)

_Jules's `REVIEW.md` (branch `jules-6296265834841558299-09e5b233`) was written
against main at `03ac630`, before the money-narration, tax-rate-unit, and
`fix/invoice-pdf-capture` merges. Each finding re-audited against current main;
severities below are ours and may differ from Jules's. Re-verify before acting._

| Finding | Status | Evidence |
|---|---|---|
| F1 — `resend()` forces `status:'sent'`, regressing a paid invoice | **Fixed — pending merge** (`fix/resend-status`) | `invoices/[id]/page.tsx` `resend()` wrote `status:'sent'` unconditionally (reachable via the always-visible "Share PDF" button `:441`), flipping a `'paid'` invoice back to `'sent'`. `reconcile_invoice_from_ledger` only fires on an `invoice_payments` change (`20260918000000`), so it stayed `'sent'` until the next ledger event — corrupting status-keyed dashboard/summary totals (see F2/F3). `/api/followups` would NOT nudge it (balance `total - amount_paid = 0` → skipped, `followups/route.ts:36-37`; `sent_at` also just reset). The old `inv.status !== 'sent'` snapshot gate also re-snapshotted a paid invoice. Fix: always bump `sent_at`; set status + `renderSnapshot` only when `inv.status === 'draft'`. Our severity **High** (Jules: Critical — reversible via any ledger touch, no false dunning). Commit `7453494`. |
| F5 — `resend()` no `try/finally` → UI stuck `busy` | **Fixed — pending merge** (`fix/resend-status`) | `setBusy(true)` cleared only on the happy path; a thrown `elementToPdf` or DB error stranded "Share PDF"/"Request balance"/"Download" disabled until reload. Wrapped the body in `try/finally`. Severity **Medium** (agrees with Jules). Commit `127c7ab`. |
| F2 — dashboard stats ignore `amount_paid` | **Open — next** (`fix/cash-basis-income`) | `dashboard/page.tsx:42-46` selects `total, status, kind` (no `amount_paid`); `paid = Σ total where status='paid'`, `outstanding = Σ total where sent/overdue`. A $1000 invoice with a $400 deposit (`sent`) shows outstanding $1000 / paid $0. Fix: select `amount_paid`; `collected = Σ amount_paid`, `outstanding = Σ max(0, total - amount_paid)`. Severity **High**. Verified 2026-09-16. |
| F3 — tax summary / Books income ignore `amount_paid` | **Open — next** (`fix/cash-basis-income`) | `tax-summary.ts:163-173` sums raw `inv.total` for brought-in (paid) and still-owed (sent/overdue); `summary/page.tsx:89` doesn't even select `amount_paid`. Same $1000/$400 case → stillOwed $1000, broughtIn $0 on a cash-basis view. Fix both files: select `amount_paid`; `broughtIn += amount_paid`, `stillOwed += max(0, total - amount_paid)`. Severity **High**. Verified 2026-09-16. F1/F2/F3 compound — fix together for correct partial-payment reporting. |
| F4 — `buildRenderData` returns inline unrounded subtotal/tax/total | **Open** (dup of existing row) | Same defect as "`buildRenderData` computes tax inline instead of `calculateTaxAmount`" above: `chat/page.tsx:716-720` returns inline `subtotal`/`taxAmount`/`total` (`:743-744`) instead of the `calculateInvoiceTotals` values computed at `:729`. Sub-cent drift, only with fractional qty/price, mostly masked by `money()`. Severity **Low–Medium** (Jules: High). Verified 2026-09-16. |
| F6 — `localDateToIso` local-midnight→UTC shifts payment dates | **Open (partly true, low impact)** | `invoices/[id]/page.tsx:31-34` stores local midnight as UTC (`paid_at`, used `:217`). Shifts only across differing record/display timezones or positive-UTC-offset users; round-trips correctly in a single negative-offset (US) zone, so ~no impact for the actual user profile. Fix if addressed: store date-only or anchor at `T12:00:00Z`. Severity **Low** (Jules: Medium). Verified 2026-09-16. |
| F7 — `confirmSummary` omits tax in announced total | **Closed** (by `14eee4c`, money narration) | No longer reproducible: `confirmSummary` now routes through `calculateInvoiceTotals` (`chat/page.tsx:778`) and announces `money(totals.total)` incl. tax + deposit (`:783-784`). Jules's cited `items.reduce` line is gone. No action. Verified 2026-09-16. |
| F8 — PDF issued vs due date format mismatch | **Open** (verifies existing "PDF date format mismatch" row) | `invoices/[id]/page.tsx:156-157` passes `issuedDate` as `toLocaleDateString()` ("9/18/2026") but `dueDate` as the raw DB date ("2026-10-18"); the chat path has the same shape (`chat/page.tsx:751-754`). Fix: format both via `formatDate()` from `@/lib/dates`. Severity **Low** (agrees). Now verified 2026-09-16. |

## Fixed + logged 2026-09-16 (chat card saves edits — branch `fix/chat-card-saves-edits`)

_The P1 "edits after the first save never reach the DB" bug, audited end to
end and fixed across five commits. New follow-up items logged below it._

| Item | Status | Evidence |
|---|---|---|
| Chat card edits dropped after first save (P1) | **Fixed — pending merge** (`fix/chat-card-saves-edits`) | Root cause: the parse handler nulled `pendingInvoiceRef` on every edit (audit "B1", `f154c49`), and the `finalize_key` idempotency guard (`74632fb`) then recovered the ORIGINAL row on the re-insert via a SELECT only — so edited line items / tax / total / deposit / notes were computed, rendered into the PDF, and thrown away. Send updated only `status`/`sent_at`/`renderSnapshot`; Download produced an edited PDF over an unchanged row. Fixed by a shared save path: `pendingInvoiceRef` now survives ordinary edits (one conversation = one invoice) and `finalize()` INSERTs on first save, UPDATEs the linked row by id on every later save (both Send and Download), from one `buildRenderData` payload, before rendering. The 23505 recovery is kept only as the reload/suspend safety net and re-applies the current draft to this conversation's own row. Commits `31b524d` (A), plus `ba8c15b` (F, buildRenderData via `calculateInvoiceTotals`) and `26865a4` (E, display-only Subtotal/Tax rows). |
| Sent/paid chat card must be read-only | **Fixed — pending merge** (`fix/chat-card-saves-edits`) | Commit B (`b068558`). The card had no knowledge of the linked row's live status (Q8). Now fetches `status` + `amount_paid` on restore, history open (re-links by `finalize_key`, rebuilding the card from the row via `draftFromRow` since finalized history stores `draft:null`), and at save time (hard refusal to update a non-draft row — the real backstop until the DB trigger below exists). Locked cards are read-only (line items, deposit, notes disabled; Send/Download/Undo/Change hidden) with a status badge, and chat edits to a locked draft are refused. |
| Revise a sent, unpaid invoice | **Fixed — pending merge** (`fix/chat-card-saves-edits`) | Commit C (`bd4fd93`). A locked `sent` invoice with `amount_paid = 0` shows "Revise": opens a NEW draft invoice in a fresh conversation seeded from the original (line items, tax, deposit, client, due date) plus a "Revises INV-XXXX" note; first save inserts a brand-new number and the original is untouched. Paid/partly-paid show a locked badge with no Revise. |
| After Download, ask if it was sent → then archive + nudge | **Open (enhancement)** | Download saves a draft and skips the send side effects (status/`sent_at`/`renderSnapshot`, Vault archive, follow-up eligibility, reminders opt-in — `chat/page.tsx` download branch). Proposed: after a download, ask "Did you send it?"; on yes, run the same mark-sent + Vault archive + follow-up path a Send does. Deliberately out of scope for the P1 branch (Download's side effects were mapped, not changed). Logged 2026-09-16. |
| DB-level draft-only lock trigger | **Open (P1 — schema integrity)** | There is no DB trigger enforcing "only a draft's money fields may change." `lock_line_items` pins `line_items` once non-draft and `lock_deposit_terms` pins deposit only once `amount_paid > 0`, but `tax_rate`/`tax_amount`/`subtotal`/`total`/`notes` remain writable on a sent row at the DB layer. The client save path now refuses non-draft updates (Commit B), but that is app-level only. Add a `BEFORE UPDATE` trigger that pins the money/content columns when `OLD.status <> 'draft'` — once migration drift is repaired (see the 2026-09-16 migration-drift row; do not `db push` onto the current remote). Logged 2026-09-16. |
| void / superseded status for revised originals | **Open (needs migration + status)** | Revise (Commit C) leaves the original `sent` and unchanged. A revised original has no marker that a newer version exists. Proposed: a `superseded` (or `void`) status set on the original when a revision is created, with a link to the revision. Needs a new status value + migration + UI, so deferred. Logged 2026-09-16. |
| Revise with payments = credit / refund | **Open (product)** | Revise is offered only for `sent` + `amount_paid = 0`. Once money has landed, changing the amount is a credit or refund, not an edit — a distinct feature (issue a credit note / record a refund against the ledger). Not built. Logged 2026-09-16. |
| Empty-state hint: a new job means a new chat | **Open (polish)** | "One conversation = one invoice" is now enforced (the change guard asks before rewriting a linked invoice; a new document comes from the compose/new-chat button). Add a light empty-state / first-run hint telling users a new job should start a new chat, so the change-guard question is rarely the first time they learn it. Logged 2026-09-16. |

## Extras — incomplete things found in passing (not on the list)

- **Middleware deleted** (see the middleware Bug row) — the inert root `middleware.ts` was removed rather than fixed after the relocation caused a signed-in login loop twice. No server-side auth gating runs; RLS is the sole boundary (audited intact).
- **Stripe Connect stub** — `settings/page.tsx` renders a disabled "Coming soon" button; comment: "Layout only; no Stripe connect logic yet."
- **Dead ref/TODO** — `chat/page.tsx:287`: `// TODO: sessionRef unused — per-message source replaced the speak gate.`
- **Unused public-invoice backend** — `get_public_invoice` + invoice token in migration `20260901120000` have no caller (tie-in to the missing pay page).
