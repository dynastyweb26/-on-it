# On It — Security Audit & Hardening (Spec)

**Repo:** dynastyweb26/-on-it · **Written:** July 6, 2026
**Execute with:** Claude Code (Opus 4.8) or Cursor — this spec is the source of truth.
**Priority:** Execute BEFORE merging feat/paywall-scaffold on July 17. Once money
flows, the chat endpoint's cost exposure and the payment surfaces stop being
theoretical.
**Standing rules:** ON-IT-DESIGN-STANDARD.md governs any UI. Audit before changing.
One commit per numbered item. `npm run build` passes before every commit. Confirm
branch and Vercel project before any push. Branch: `feat/security-hardening` off main.

**Context:** T-Vault went through a full OWASP/CWE/ASVS pass. On It did NOT — it was
built fast. This closes that gap. Reference T-Vault's SECURITY.md / SECURITY-DEEP.md
conventions where useful, but On It has its own routes.

---

## Item 0 — Audit (no changes; output SECURITY-AUDIT.md)

Inventory and report, stop for review before fixing anything:
- Every API route under `src/app/api/` (and any route handlers): method, auth
  check present/absent, input validation present/absent, what external service
  it calls (Anthropic, EmailJS, Supabase, Stripe).
- Which routes call the **Anthropic API** (Claude Haiku) — these are cost-exposed.
- Which routes call **EmailJS** — these are spam/abuse-exposed.
- Which Supabase client each route uses: user-session vs service-role. Flag every
  service-role usage and whether it's justified (webhooks/admin only).
- Current rate limiting: confirm none exists, or document what does.
- Auth middleware: which routes are protected, which are public, any gaps (the
  known Settings "infinite loading when unauthenticated" bug is a symptom — check
  middleware matcher coverage).
- Security headers / CSP: present or absent.
- Input validation library in use (zod?) and where it's applied vs missing.

**Commit:** `chore(security): audit inventory`

---

## Item 1 — Rate limiting (highest priority)

**The exposure:** the chat route calls Claude Haiku on every message. Unthrottled,
one hostile user or a broken retry loop burns the Anthropic bill at request speed.
EmailJS invoice-send is similarly abusable for spam.

**Spec:**
- Add rate limiting to, at minimum: the chat/AI route, the invoice-send (EmailJS)
  route, and any parse/transcribe routes that call paid APIs.
- v1 uses Upstash Redis (not in-memory — in-memory is per-Vercel-instance, resets
  on cold start, doesn't hold across instances; this is the same lesson from
  T-Vault's deferred list). Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
  documented in .env.example. If Upstash isn't set up yet, STOP and tell me to
  create the Upstash database first — do not silently fall back to in-memory.
- Limit by authenticated user id where available, by IP for public routes.
- Sensible per-route limits (starting points, tune later): AI chat ~20/min/user,
  invoice-send ~10/min/user, transcribe ~30/min/user. Return 429 with a clear
  message the client surfaces gracefully (no crash, no raw error).
- The 429 response on the chat route should degrade politely in-app
  ("One sec — slow down a moment") using standard tokens, not a stack trace.

**Commit:** `feat(security): rate limiting on paid-API routes via Upstash`

---

## Item 2 — Input validation sweep

**Spec:**
- Every API route that accepts a body validates it with zod (or the existing
  validation lib if one's already in use) before touching it: types, lengths,
  enums, required fields. Reject with 400 + field-level message on failure.
- Pay special attention to anything that reaches Supabase or an external API —
  never pass unvalidated user input downstream.
- Cap free-text field lengths server-side (invoice descriptions, client names,
  chat messages) to prevent oversized-payload abuse and runaway AI token spend.

**Commit:** `feat(security): zod validation on all API route inputs`

---

## Item 3 — Service-role client audit

**Spec:**
- From the Item 0 inventory, confirm the service-role Supabase client is used
  ONLY where genuinely required (the Stripe webhook is the legitimate case —
  it has no user session). Everywhere else must use the user-session client so
  RLS enforces ownership.
- Any service-role usage in a user-facing request path is a defect — refactor to
  the session client. If one genuinely can't be, document why in SECURITY-AUDIT.md.
- This directly protects the Batch 4b chat-DB feature built later: the pattern
  must already be "session client only" before that lands.

**Commit:** `refactor(security): restrict service-role client to webhook only`

---

## Item 4 — Auth middleware + headers

**Spec:**
- Fix the middleware matcher so every authenticated route is actually protected;
  unauthenticated access redirects to /login cleanly (this resolves the Settings
  infinite-loading symptom at the root, not just the symptom).
- Confirm public routes stay public: /login, /i/[token] referral links, legal
  pages, the Stripe webhook.
- Add security headers (next.config): X-Frame-Options or frame-ancestors CSP,
  X-Content-Type-Options nosniff, Referrer-Policy, and a Content-Security-Policy
  scoped to the actual origins the app uses (Supabase, Anthropic, EmailJS,
  Stripe, the fonts/CDNs already in use). Test that the CSP doesn't break the
  existing app before committing.

**Commit:** `feat(security): middleware coverage + security headers`

---

## Item 5 — Verify + report

- Re-run the Item 0 inventory format as SECURITY-AUDIT.md "after" state: every
  route now shows auth + validation + rate-limit + correct client.
- Confirm build passes, app still works (walk login, chat, invoice create/send,
  settings).
- List anything deferred with a reason (e.g. HIBP leaked-password protection
  needs a Supabase Pro plan — same as T-Vault's deferred item).
- Do NOT merge without my review — report first.

---

## Out of scope
Penetration testing, SOC2-type compliance, the Supabase Auth settings that must
be toggled in the dashboard (confirm-email on, min password length) — those are
dashboard actions for the founder, not code. List them as a founder checklist in
SECURITY-AUDIT.md instead.
