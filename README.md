# On It — Invoices done by talking

Voice-powered invoicing PWA for blue collar professionals. Speak the job, get a branded PDF, share it, get paid. A Dynasty Web product. `$9/month` · `onit.dynastyweb.co`

## Stack
Next.js 14 App Router · Supabase (auth, Postgres, storage) · Claude Haiku 4.5 (field extraction) · AssemblyAI (voice) · EmailJS · jsPDF + html2canvas · Web Push · Vercel

## Setup (do these in order)

1. **Install**
   ```bash
   npm install
   cp .env.example .env.local   # then fill in every value
   ```

2. **Database** — open Supabase SQL Editor (project `bitfmmffnigxjjyxoxfr`) and run
   `supabase/migrations/001_init.sql` top to bottom. It creates all tables, RLS,
   audit triggers, storage buckets, and the atomic invoice-number function.

3. **VAPID keys** (payment follow-up notifications)
   ```bash
   npx web-push generate-vapid-keys
   ```
   Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, private in `VAPID_PRIVATE_KEY`.
   Set the same two + `CRON_SECRET` in Vercel env vars. The cron in `vercel.json`
   runs daily at 15:00 UTC (9/10am Texas).
   **In Vercel → Cron, the request must send `Authorization: Bearer <CRON_SECRET>`** —
   easiest is to include the secret check via Vercel's built-in cron auth or a query rewrite.

4. **Icons** — replace `public/ICONS-TODO.md` with real `icon-192.png` and `icon-512.png`.

5. **Run**
   ```bash
   npm run dev
   ```

## Pre-launch checklist (same discipline as T-Vault)
- [ ] Supabase Auth: enable "Confirm email"
- [ ] Supabase Auth: minimum password length 6 → 8
- [ ] Rotate any key that ever touched a chat log
- [ ] Confirm Vercel project name before first push (tvault/t-vault lesson)
- [ ] Test share sheet on a real phone (navigator.share needs HTTPS)
- [ ] Stripe subscription gate — not built yet; ship beta on manual access first

## Architecture map
```
src/app/(app)/chat        ← the product. "On it! 🎉" loop, voice, finalize→PDF→share
src/app/onboarding        ← brand moment: colors, background pick, template pick
src/app/api/parse         ← Claude Haiku extraction + duplicate detection
src/app/api/transcribe    ← AssemblyAI upload/poll
src/app/api/followups     ← daily cron: unpaid 2+ days → push notification
src/lib/colors.ts         ← 20-swatch palette + locked role logic
src/lib/pdf/templates     ← the 4 layouts: classic / sidebar / industrial / friendly
src/lib/pdf/generate.ts   ← html2canvas → jsPDF → File → navigator.share
supabase/migrations       ← full schema, RLS, audit log, rate limits, encryption
```

## Known v1 boundaries (deliberate)
- Offline mode, home-screen widget, mileage auto-log → v1.1 (complexity vs. launch)
- WhatsApp/SMS sending → v1.1 (share sheet covers it)
- Stripe Connect embedded payments → v2 (Zelle/Cash App/PayPal.me display for now)
- Receipt photo AI-read → wire `parse-document` pattern from T-Vault when ready
