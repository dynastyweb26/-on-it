# On It — Locked Product Spec (v1)
_Source of truth for Cursor iteration. Do not drift from these decisions without founder sign-off._

- **Positioning**: invoice assistant for blue collar / home service pros. Usable entirely by voice — accessible to non-readers. "Make using On It feel good, never make not using it feel bad." No fake streaks, no manufactured scarcity.
- **Price**: $9/month flat, all features. Domain: onit.dynastyweb.co.
- **Core loop**: speak/type job → "On it! 🎉" → one clarifying question at a time → preview card → PDF → **native share sheet** (no Twilio) → follow-up push every 2 days until marked paid.
- **Onboarding**: business-only (name, trade, logo, website, slogan) → pick 2-3 of 20 colors → **explicitly pick which is the background** → pick 1 of 4 templates with live preview.
- **Color logic (locked)**: dark background → white main text; light background → black main text. Remaining picks: darker → primary (headers), brighter → accent (totals, website, slogan, dividers). No auto-guessing backgrounds, no complex contrast math. Gentle nudge (dismissible) if all picks are same-lightness.
- **Templates**: 4 genuinely different layouts — Classic (centered, ruled), Sidebar (color band left), Industrial (full-bleed header block, heavy type — the Cyril black/red energy), Friendly (rounded cards, built from scratch).
- **Filename**: `INV-####_ClientName_Date_BusinessName.pdf`
- **Payments shown on invoice**: Zelle (encrypted at rest), Cash App tag, PayPal.me. Manual "Mark as Paid" always available. Stripe Connect = v2.
- **Also in v1**: expense logging via chat with tax-deductible flag, quote mode with one-tap convert to invoice, The Vault (auto-archive of every PDF, searchable), Net Spend dashboard, client history, duplicate detection (same client + amount within 48h), deferred auth (5 free guest parses).
- **v1.1**: WhatsApp/SMS send, industry template packs, teams, Plaid. **Deferred from v1**: offline mode, home-screen widget, mileage auto-log, receipt photo AI-read.
- **Infra**: Supabase `bitfmmffnigxjjyxoxfr` · GitHub `dynastyweb26/-on-it` · EmailJS `service_mov6wn1` / `template_ukaqa74` · Model `claude-haiku-4-5-20251001`.
