# On It — Security Architecture

All nine T-Vault security holes prevented from day one, plus On It-specific layers.

## The 7 layers (implemented)
| # | Layer | Where |
|---|-------|-------|
| 1 | RLS on every table, deny-by-default, owner-only policies | `001_init.sql` |
| 2 | RBAC role column on top of RLS (owner/member/admin) | `profiles.role` |
| 3 | Audit log table + triggers on invoices/profiles (payment data excluded from log detail; DELETE-event payloads redacted — account teardown keeps who/what/when, drops personal data) | `audit_log`, `log_audit()` |
| 4 | Per-user/IP Upstash-backed rate limiting (atomic sliding window, cross-instance safe — T-Vault lesson) | `src/lib/ratelimit.ts` (Upstash Redis) |
| 5 | Column-level encryption for Zelle info (pgcrypto, key server-side only) | `zelle_info_enc`, `set_zelle()`/`get_zelle()` |
| 6 | Service-role isolation (`server-only` import guard; key never in client bundle) | `src/lib/supabase/admin.ts` |
| 7 | Input sanitization against prompt injection (tag stripping, length caps, `<user_input>` wrapping, model instructed to treat contents as data) | `src/lib/sanitize.ts`, `src/lib/ai.ts` |

## On It-specific additions
- **Voice transcript sanitization** — transcribed text runs through the same sanitize path as typed text before reaching Claude.
- **Audio transcribe-and-discard** — audio blobs are streamed to AssemblyAI and never written to our storage; only text survives.
- **PDF privacy** — PDFs are generated client-side; nothing sensitive transits our servers to build them.
- **Guest limits** — deferred auth capped at 5 parses via httpOnly cookie; guests can't write to the database at all (RLS blocks it regardless).
- **Guest transcribe cost cap** — the open voice demo is gated two ways so rotating IPs / cleared cookies can't drain AssemblyAI credits: a per-browser httpOnly cookie quota (`onit_guest_tx`, 6 transcriptions) plus a global per-day ceiling across all guests (`reserveGuestDaily` in `ratelimit.ts`, 500/day). Both are guest-only; signed-in users keep the standard rate limits.
- **Cron auth** — `/api/followups` and `/api/trial-reminders` require `Bearer CRON_SECRET`.
- **Length constraints in SQL** — every text column has a CHECK cap as a final backstop.

## Rules for future changes (Cursor: read this)
- Never import `supabase/admin.ts` from a client component. `server-only` will throw — do not remove it.
- Any new table gets RLS + owner policy in the same migration. No exceptions.
- Any new AI input path goes through `sanitizeForAI()` and `<user_input>` wrapping.
- Audit-first before fixing bugs. Confirm branch and Vercel project before pushing.
