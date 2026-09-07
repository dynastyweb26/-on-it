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
2. **RLS is the auth boundary; middleware is defense-in-depth.** Row-level
   security on every user-data table (owner-only, scoped to `auth.uid()`) is
   what actually protects data — verified intact by policy review + anonymous
   REST probes. Middleware is a second layer, not the boundary. Both are
   verified, never assumed.
3. **Middleware must be tested against a signed-in session, not just cookieless
   requests.** A cookieless request 307s to `/login` and looks fine while the
   signed-in path still loops or hangs — the cookieless 307 passing is not proof
   the gate works. Any middleware change is verified with a real session.

## Bugs

| Item | Status | Evidence |
|---|---|---|
| middleware cookie write-back | **Open (reverted)** | `middleware.ts` lives at the repo **root**, but the app is under `src/`, so Next.js never loads it — the relocation fix `c2daaa4` was reverted by `8392ada`. The cookie write-back itself is present in source (`middleware.ts:16-22`, `setAll` writes request + response cookies) but is **inert** because the middleware never runs. Consequence: no server-side auth gate; RLS is the only boundary (audited intact). |
| summary getUser stall | **Open** | `src/app/(app)/summary/page.tsx:52-53` gates on the network `getUser()` with **no** `getSession()` fast-path and **no** timeout — the same stall settings had. The settings fix (`09dcc22`) was never ported here. |
| settings unauthenticated loading | **Done** | `09dcc22` — `src/app/(app)/settings/page.tsx` added a local `getSession()` fast-path that redirects a signed-out user to `/login` instantly instead of hanging on "Loading…". |
| duplicate warning loop | **Done** | Break A `5a6ddfa` (server-honored `dupAcked`, `src/app/api/parse/route.ts:73` skips the query when set), Break B `8862ed0` (`finalize` `alreadyConfirmed` bypass), display-time ack `df46cd6` (set when the warning shows, not when answered — `chat/page.tsx` ~661). |
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

## Extras — incomplete things found in passing (not on the list)

- **Inert middleware** (see Bug 1) — root vs `src/` placement means no server-side auth gating runs in dev or prod. Highest-impact of anything here; RLS is currently the only auth boundary.
- **Stripe Connect stub** — `settings/page.tsx` renders a disabled "Coming soon" button; comment: "Layout only; no Stripe connect logic yet."
- **Dead ref/TODO** — `chat/page.tsx:287`: `// TODO: sessionRef unused — per-message source replaced the speak gate.`
- **Unused public-invoice backend** — `get_public_invoice` + invoice token in migration `20260901120000` have no caller (tie-in to the missing pay page).
