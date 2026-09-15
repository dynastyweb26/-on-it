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

## Extras — incomplete things found in passing (not on the list)

- **Middleware deleted** (see the middleware Bug row) — the inert root `middleware.ts` was removed rather than fixed after the relocation caused a signed-in login loop twice. No server-side auth gating runs; RLS is the sole boundary (audited intact).
- **Stripe Connect stub** — `settings/page.tsx` renders a disabled "Coming soon" button; comment: "Layout only; no Stripe connect logic yet."
- **Dead ref/TODO** — `chat/page.tsx:287`: `// TODO: sessionRef unused — per-message source replaced the speak gate.`
- **Unused public-invoice backend** — `get_public_invoice` + invoice token in migration `20260901120000` have no caller (tie-in to the missing pay page).
