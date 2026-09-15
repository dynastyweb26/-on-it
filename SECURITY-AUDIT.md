# On It — Security Audit (Item 0 Inventory)

**Branch:** `feat/security-hardening` (off `main` @ `596361c`) · **Date:** 2026-07-06
**Scope:** current `main`. The Stripe/paywall routes are NOT on main yet — they
live on `feat/paywall-scaffold` (merges July 17). They're inventoried in a
clearly-marked forward section so hardening covers them before that merge.
**Status:** AUDIT ONLY — no code changed. Findings ranked; fixes are Items 1–4.

---

## 1. API route inventory (current `main`)

| Route | Method | Auth check | Input validation | External service | Supabase client |
|---|---|---|---|---|---|
| `/api/parse` | POST | Partial — session OR guest cookie counter | Manual: `body.history?.length` only; `sanitizeForAI()` per message (2000-char cap, tag/control strip) | **Anthropic (Claude Haiku)** — cost-exposed | user-session (`createClient`) + **service-role** via `checkRateLimit` |
| `/api/transcribe` | POST | **None** — runs for anyone | `byteLength` 0–10MB check only | **AssemblyAI** — cost-exposed | user-session (read only) + **service-role** via `checkRateLimit` (auth users only) |
| `/api/zelle` | GET, POST | Yes — `requireUser()` 401s | `sanitizeField(value,120)` on POST; `full` query flag | none (Supabase RPC) | **service-role** (`adminClient`) — calls `get_zelle`/`set_zelle` RPCs + direct profiles update |
| `/api/followups` | GET | Yes — `Bearer CRON_SECRET` | none (no body) | web-push (VAPID) | **service-role** (`adminClient`) |
| `/i/[token]` (route handler) | GET | Public by design | **None** — `params.token` written to cookie unvalidated | none | none (sets `onit_grant` cookie, redeemed later) |

**Not API routes but security-relevant:**
- `/login` — page (client). Supabase auth signUp/signInWithPassword.
- Invoice "send" — **client-side only**: `navigator.share()` + client PDF gen
  (`src/lib/pdf/generate.ts`). No server route, no server cost.

---

## 2. Cost-exposed routes (paid external APIs)

- **Anthropic / Claude Haiku** → `/api/parse` only (via `src/lib/ai.ts extract()`).
- **AssemblyAI** → `/api/transcribe` only.
- These two are the entire paid-API attack surface. Both have a **guest-bypass
  gap** in rate limiting (see §5) — the single highest-priority finding.

## 3. EmailJS (spam/abuse-exposed)

- **Finding: no EmailJS route exists.** `@emailjs/browser` is in `package.json`
  but is **never imported or called** anywhere in `src/` (grep-confirmed).
- Invoice delivery is the native share sheet, not email. The spec's assumed
  "invoice-send (EmailJS) route" does not exist on main — **nothing to
  rate-limit here.** Recommend removing the unused dependency, or if EmailJS is
  planned, it must be a server route (not client — the public key + template are
  abusable from the browser) and rate-limited then.

## 4. Service-role Supabase client usage

`adminClient()` (service-role, bypasses RLS) is used in:

| Location | In user request path? | Justified? |
|---|---|---|
| `/api/followups` | No (cron, `Bearer` auth, no user session) | ✅ Legitimate — no session exists |
| `/api/zelle` (RPC calls) | Yes | ⚠️ Partly — `get_zelle`/`set_zelle` are `revoke`d from `authenticated`, so service-role is required to invoke them (encryption-key handling). Justified. |
| `/api/zelle` (direct `profiles` update to null) | Yes | ❌ Avoidable — the "clear Zelle" path uses admin to `update profiles`; a session client would work under RLS. Tighten in Item 3. |
| `src/lib/ratelimit.ts` (`checkRateLimit`) | Yes — called from parse/transcribe/zelle | ⚠️ Required as built: `rate_limits` has RLS enabled with **no policies** (deny-all to session clients), so only service-role can read/write it. This puts service-role in every rate-limited user request. Acceptable for a counter table with no user data, but note it for Item 3 — the Upstash migration (Item 1) removes this Postgres dependency and the service-role touch entirely. |

**No service-role usage leaks ownership of user data today.** The pattern to
protect (Item 3 / Batch 4b) is already "session client for user data"; the only
service-role touches are the cron, the encryption RPCs, and the counter table.

## 5. Rate limiting — CURRENT STATE (spec said "confirm none"; it exists)

**There IS a rate limiter:** `src/lib/ratelimit.ts checkRateLimit(userId, route,
maxPerMinute)` — Postgres-backed (`rate_limits` table), 60s fixed window.

Applied:
| Route | Limit | Gap |
|---|---|---|
| `/api/parse` | 20/min | **Only if `user` is set** — guests are NOT limited |
| `/api/transcribe` | 10/min | **Only if `user`** — and no auth at all, so anonymous callers skip it entirely |
| `/api/zelle` | GET 10 / POST 5 | OK (auth required) |

**Critical gaps:**
1. **Guest bypass on the two cost-exposed routes.** `parse` limits only
   authenticated users; guests are bounded solely by the `onit_guest` cookie
   (httpOnly but trivially reset by clearing cookies) with **no IP fallback**.
   `transcribe` has no auth and no guest limit at all → unauthenticated,
   unlimited AssemblyAI spend.
2. **Not atomic.** `checkRateLimit` does read-then-write (select, then
   upsert/update) — two concurrent requests can both read `count < max` and both
   pass. Burst abuse slips through.
3. **Per-instance-safe but Postgres-latency per call** — every AI request pays a
   DB round-trip before the model call. Item 1's Upstash move fixes atomicity
   (INCR) and adds IP-based limiting for public routes.

## 6. Auth middleware coverage

> **UPDATE 2026-09-15:** `middleware.ts` was **deleted** after it caused two
> production login loops. It never actually gated routes: the file sat at the
> repo root, where Next.js (a `src/` app) never loaded it, so it was inert;
> relocating it into `src/` to make it run bounced signed-in users back to
> `/login` twice and was reverted both times. **RLS is the only server-side
> auth boundary.** The per-page `/login` redirects described below are
> client-side UX, not a security gate. The rest of this section is retained as
> the 2026-07-06 snapshot and should be read in light of this note.

Intended middleware coverage at audit time (redirect → `/login` if no user):
`/dashboard, /invoices, /expenses, /vault, /settings, /onboarding`.

- **Matcher excluded `api/`** — middleware would not run on API routes; each does
  its own auth (parse/transcribe are intentionally guest-open).
- `/chat` intentionally public (guest parses). `/i/[token]` public (redemption).
- `/invoices/[id]` covered by the `/invoices` prefix.

**Settings "infinite loading when unauthenticated" — root cause identified:**
The root cause was always client-side, not the middleware (which, per the note
above, never ran): `supabase.auth.getUser()` in the Settings page returns null
for a signed-out user, and the effect did `if (!user) return;` **without
redirecting**, leaving `p === null` forever → the `if (!p) return <Loading…>`
spinner never resolves. Fix in Item 4: client pages must redirect to `/login` on
a null user rather than hang. Same pattern existed on other client pages that
early-return.

## 7. Security headers / CSP

`next.config.mjs` sets: `X-Frame-Options: DENY`, `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), geolocation=()`.

**Missing:** `Content-Security-Policy` (none), `Strict-Transport-Security`
(HSTS). Item 4 adds a CSP scoped to actual origins: Supabase
(`*.supabase.co`), Anthropic is server-side only (no browser origin needed),
AssemblyAI is server-side only, Google Fonts (`fonts.googleapis.com` /
`fonts.gstatic.com` for Material Symbols + Montserrat/Inter), and — for July 17 —
Stripe (`js.stripe.com` script + frame, `*.stripe.com` frames, and
`api.stripe.com`/`r.stripe.com`/`m.stripe.com` in `connect-src` for Stripe.js
XHR + telemetry). Must be tested against the live app (webfonts + Supabase
realtime/storage) before commit.

## 8. Input validation library

- **No zod (or any schema lib) in use.** Validation is ad-hoc:
  - `parse`: only checks `history.length` exists; array shape/roles unchecked
    beyond a role coalesce; `draft` passed through unvalidated.
  - `transcribe`: byte-length only.
  - `zelle`: `sanitizeField` (strips `<>`, caps length).
  - `/i/[token]`: **no validation** on the token before it's cookie-stored.
- Item 2 adds zod at every body-accepting route with field-level 400s and
  server-side length caps (invoice descriptions, client names, chat messages)
  to bound both payload size and AI token spend.

---

## Findings ranked (feeds Items 1–4)

| # | Severity | Finding | Fix item |
|---|---|---|---|
| 1 | **High** | Guest/anon bypass of rate limits on `/api/parse` + `/api/transcribe` → uncapped Anthropic/AssemblyAI spend | Item 1 |
| 2 | **High** | `/api/transcribe` has no auth at all | Item 1 (IP limit) + Item 4 |
| 3 | Med | Rate limiter not atomic (race lets bursts through) | Item 1 (Upstash INCR) |
| 4 | Med | No zod validation; `parse` `history`/`draft` shape unchecked | Item 2 |
| 5 | Med | No CSP / HSTS headers | Item 4 |
| 6 | Med | Settings (and peers) hang instead of redirecting on null user | Item 4 |
| 7 | Low | `/i/[token]` cookie value unvalidated (length/charset) | Item 2 |
| 8 | Low | `zelle` clear-path uses service-role where session client suffices | Item 3 |
| 9 | Low | Unused `@emailjs/browser` dependency (dead attack-surface/bloat) | note |

---

## Incoming on `feat/paywall-scaffold` (harden as it merges, July 17)

These routes aren't on main but the audit must account for them since this
hardening precedes their merge:

| Route | Auth | Client | Notes for hardening |
|---|---|---|---|
| `/api/checkout` | session | session | Rate-limit (checkout spam); zod not needed (no body) but validate origin |
| `/api/webhooks/stripe` | **Stripe signature** | **service-role** ✅ | Legitimate service-role case (no user session). Auth is the Stripe signature only — no session gate (there is no middleware; see §6). Verify signature before body use (already does). |
| `/api/billing-portal` | session | session | Rate-limit |
| `/api/account/delete` | session + typed confirm | **service-role** ✅ | Justified (storage + auth admin API). Rate-limit hard (already 3/min); zod the confirm body |
| `/api/access` | session | session | Read-only; fine |

CSP must include Stripe origins before this merges (see §7).

---

## Founder checklist (dashboard actions — out of code scope)

Per the spec's out-of-scope note, these are Supabase Dashboard toggles the
founder must set (not code):
- [ ] Supabase Auth → **Confirm email ON** (currently per README pre-launch list, unverified)
- [ ] Supabase Auth → **minimum password length ≥ 8** (login enforces 8 client-side; DB/Auth should match)
- [ ] Rotate any key that ever touched a chat log or screenshot
- [ ] **Upstash Redis database** must be created before Item 1 (env:
      `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) — Item 1 is blocked
      until this exists (spec: do not fall back to in-memory)
- [ ] Deferred (needs Supabase **Pro** plan): HIBP leaked-password protection —
      same deferral as T-Vault. List only; no code.
- [ ] Confirm `CRON_SECRET`, `ZELLE_ENC_KEY`, service-role key set in Vercel
      (production) and never in the client bundle.

---

## AFTER — state with Items 1–4 applied (for review)

| Route | Auth | Input validation | Rate limit | Client |
|---|---|---|---|---|
| `/api/parse` | session or guest-cookie | **zod** (history shape + 4k msg cap + 8k draft cap) + `sanitizeForAI` | **Upstash** 20/min, **user-or-IP** (guest gap closed) | session (+ no service-role) |
| `/api/transcribe` | user-or-IP limited | byte-length 0–10MB (binary) | **Upstash** 30/min, **user-or-IP** (anon gap closed) | session (read) |
| `/api/zelle` | `requireUser()` 401 | **zod** value ≤200 + `sanitizeField` | **Upstash** read 10 / write 5 per user | session for clear; **admin only** for revoked RPCs |
| `/api/followups` | `Bearer CRON_SECRET` | none (no body) | n/a (cron) | admin (justified — no session) |
| `/i/[token]` | public | **charset/length regex** before cookie set | n/a | none |

**Headers now:** CSP (scoped), HSTS, X-Frame-Options, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy. Verified emitted on `/login` (200) via a
production `npm run start` smoke test; production CSP correctly omits
`unsafe-eval`.

**Verified automatically:** `tsc --noEmit` clean, `npm run build` passes on every
commit, header smoke test, grep-confirmed zero `checkRateLimit` refs and
service-role only in cron + revoked-RPC paths.

**Needs manual verification (can't do headlessly — needs a real session):**
walk login → chat (send a message; confirm 429 degrades to "One sec — slow down
a moment" under a burst) → invoice create/send → settings load (confirm no
infinite spinner) → logo upload. Recommend a quick pass against a preview deploy
before merge. **Also load every page with the browser console open to confirm no
CSP violations** — the CSP was smoke-tested on `/login` but authenticated pages
(Supabase images/realtime, Material Symbols font) should be eyeballed once.

## Deferred (with reasons)

- **Nonce-based CSP** — script-src keeps `'unsafe-inline'` because Next injects
  inline bootstrap scripts without a nonce; a strict nonce CSP needs nonce
  middleware and carries breakage risk. Present CSP still adds real value
  (connect/img/font/frame scoping, `object-src 'none'`, `frame-ancestors`).
  Follow-up, not a blocker.
- **HIBP leaked-password protection** — needs Supabase **Pro** plan (same
  deferral as T-Vault). Founder-dashboard action, not code.
- **Rate-limit fail-open** — `rateLimit()` fails open on a Redis outage
  (availability over a narrow cost window). Revisit if abuse is observed.
- **`rate_limits` Postgres table** — now unused (Upstash replaced it). Left in
  place; drop in a future migration once the Upstash cutover is confirmed in
  production.
- **Paywall-scaffold routes** — intentionally NOT hardened on this branch (per
  instruction). Re-apply these same patterns (Upstash limits on
  checkout/billing-portal, zod on account/delete confirm) when
  `feat/paywall-scaffold` merges July 17. CSP now includes the Stripe origins
  Stripe.js needs: `js.stripe.com` in `script-src`, `js.stripe.com` +
  `*.stripe.com` in `frame-src`, and `api.stripe.com` + `r.stripe.com` +
  `m.stripe.com` in `connect-src` (the connect-src origins were added in the
  CSP fix commit — they were missing in the original hardening pass).

## Item 1 blocker — RESOLVED

Upstash Redis is provisioned; `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
are set in Vercel + `.env.local`. **Founder action before merge:** confirm both
vars are present in the Vercel **production** environment (not just preview/dev)
so the limiter is active in prod — otherwise `rateLimit()` fails open and the
cost guard is silently off.
