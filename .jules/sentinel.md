## 2026-03-31 - Unconfigured Secret Bypass in Cron Authentication
**Vulnerability:** Unconfigured CRON_SECRET environment variable allowed unauthenticated callers to bypass authorization on administrative Cron endpoints (/api/followups and /api/trial-reminders) by sending an Authorization header matching "Bearer undefined".
**Learning:** Checking authorization headers directly against template string interpolations like `Bearer ${process.env.SECRET}` without checking if the secret is set fails open if the secret is undefined.
**Prevention:** Always fail closed by checking that secret environment variables exist and are non-empty before comparison, and use constant-time comparisons (such as crypto.timingSafeEqual) for token verification.
