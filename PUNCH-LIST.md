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
| pay page `/pay/[token]` | **Open** | No `/pay` route exists. Backend scaffolding is present but **unused**: `get_public_invoice(text,text)` and the invoice token (`gen_invoice_token`) in migration `20260901120000_payment_methods_and_public_invoice.sql`; no app code calls either. |

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
| Narration total disagrees with the card | **Open (unverified)** | Spoken/narrated total reads $1,684.50 while the invoice card shows $2,351.00. Reported 2026-09-15; root cause not yet located (candidate: narration string vs. card total derive from different fields). |
| Chat-requested deposits become line items | **Open (unverified)** | A deposit requested in chat is added as an invoice line item instead of being handled as a deposit / amount due now. Reported 2026-09-15. |
| PDF date format mismatch | **Open (unverified)** | The PDF mixes date formats within one document (e.g. `9/13/2026` vs. `2026-10-13`). Reported 2026-09-15. |
| Request-balance PDFs never archived to the Vault | **Open (unverified)** | Balance-request PDFs are generated but not written to the Vault archive like other invoice PDFs. Reported 2026-09-15. |
| Header: show project total as a subline under "due now" | **Open (enhancement)** | The header shows the due-now amount; add the full project total as a subline beneath it. Reported 2026-09-15. |
| `enforce_free_invoice_limit` counts soft-deleted rows | **Open** | `20260724154509_enforce_free_invoice_cap.sql:73-75` counts all `kind='invoice'` rows for the user with no `deleted_at is null` guard; `deleted_at` was added later (`20260905000000_soft_delete`), so soft-deleted invoices still count toward the free cap. Verified 2026-09-15. |
| Nine duplicate `money()` helpers | **Open** | Nine `money()` definitions: one canonical export (`src/lib/financials.ts:30`) plus eight inline copies — `chat/page.tsx:42`, `dashboard/page.tsx:10`, `expenses/page.tsx:12`, `invoices/page.tsx:14`, `invoices/[id]/page.tsx:17`, `summary/page.tsx:23`, `pdf/summary-template.tsx:33`, `pdf/templates/index.tsx:57`. Consolidate onto `financials.money()`. Verified 2026-09-15. |
| Dead space on the final PDF page | **Open (unverified)** | The last page of the generated PDF carries excess trailing whitespace. Reported 2026-09-15. |
| Public card payment route | **Open (deferred)** | No public card-payment endpoint exists yet; deferred. Adjacent to the unbuilt pay page `/pay/[token]` (Features) and the unused `get_public_invoice` backend (Extras) — dedupe with those if they are treated as one workstream. Reported 2026-09-15. |
| Unmerged work to port | **Open** | Not yet merged to `main`: soft-delete + back nav (Jules `2ef8490`), date dividers + deductible removal, loading skeletons, PDF fonts + PNG. Reported 2026-09-15; confirm each branch before porting. |
| Delete test invoice INV-0016 from Cyril's account | **Open (manual, live DB)** | One-time cleanup: remove test invoice `INV-0016` from Cyril's account once soft-delete ships. Live-DB action, not code. Reported 2026-09-15. |

## Extras — incomplete things found in passing (not on the list)

- **Middleware deleted** (see the middleware Bug row) — the inert root `middleware.ts` was removed rather than fixed after the relocation caused a signed-in login loop twice. No server-side auth gating runs; RLS is the sole boundary (audited intact).
- **Stripe Connect stub** — `settings/page.tsx` renders a disabled "Coming soon" button; comment: "Layout only; no Stripe connect logic yet."
- **Dead ref/TODO** — `chat/page.tsx:287`: `// TODO: sessionRef unused — per-message source replaced the speak gate.`
- **Unused public-invoice backend** — `get_public_invoice` + invoice token in migration `20260901120000` have no caller (tie-in to the missing pay page).
