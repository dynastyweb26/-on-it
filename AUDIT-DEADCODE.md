# Dead-code audit — 2026-10-09

Branch `chore/deadcode-audit` from `main` at `a4b991d`. **Read-only: nothing
was deleted or changed.** This file is the only change.

**Method.** `npx knip@5` (not added as a dependency; default config with the
Next.js plugin, test files count as usage), then manual checks:

- exact-token search for every class and `@keyframes` name in `globals.css`
  and `recap.css`;
- every dependency against its imports and config use;
- every `process.env.*` read in `src/` and `scripts/` against the Vercel env
  list (names only, no values read);
- each knip "unused export" checked for use inside its own file.

**Treated as not dead:**
- Next.js convention files;
- the `vercel.json` cron routes;
- dynamic imports;
- the service worker;
- `supabase/migrations`;
- `package.json` scripts.

**"After smoke test"** marks anything in `/api/followups` or the recurring
code; it waits for the post-merge recurring cron smoke test (scheduled for
2026-10-09 15:00 UTC).

## Summary

| Area | Result |
|---|---|
| Unused files | 3 candidates (2 design references, 1 tooling script); knip's 4th (`public/sw.js`) is a false positive |
| Unused components superseded by the redesign | No unused component **files**; one superseded component: `SortToggle` (default export) |
| Unused exports | 4 symbols unused anywhere, plus 5 unused re-exports; ~60 exports and 67 types used only inside their own file (no need to export) |
| Unused npm dependencies | **None** (knip and manual check agree) |
| Unused CSS classes / keyframes | **None** |
| Dead env vars | 2 branch-scoped Preview vars for merged branches; 4 vars never read by code |
| Feature flags | `RECAPS_LIVE`, `PAYWALL_ENABLED`: both on in production since launch; their off branches only run on previews (decision, not cleanup) |

## Batch 1 — Vercel env vars (no code change)

| Item | Evidence it's unused | Confidence | Risk if wrong |
|---|---|---|---|
| `NEXT_PUBLIC_RECAPS_LIVE` · Preview (`feat/recap`) | `feat/recap` is merged into `main` (local and `origin`); nothing deploys that branch now | high | A new `feat/recap` preview would show "Coming soon" instead of recaps |
| `NEXT_PUBLIC_PAYWALL_ENABLED` · Preview (`feat/paywall-v2`) | `feat/paywall-v2` is merged; paywall launched 2026-10-02 (PUNCH-LIST) | high | Same, for a `feat/paywall-v2` preview |
| `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY`, `_SERVICE_ID`, `_TEMPLATE_ID` | Never read: no `EMAILJS` / `emailjs` anywhere in `src/`, `scripts/`, `public/` or `package.json`; only the stale ONIT-SPEC infra line names EmailJS | med-high | If something outside the repo uses them, it breaks. Copy the values somewhere before removing |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (Preview + Production) | Never read; no `loadStripe` / Stripe.js in the app (payments use Checkout redirects and server keys) | med | A future Stripe.js / Elements feature needs it again. Keep a copy |

## Batch 2 — Unused files

| Item | Evidence it's unused | Confidence | Risk if wrong |
|---|---|---|---|
| `tokens.css` (repo root) | knip: no importer. From the 2026-07-05 design-standard commit (`6569574`); only docs reference it (DESIGN-AUDIT, MIGRATION-PLAN, MOTION-SPEC) | med | Docs lose their reference. Suggest moving it to `design-reference/`, not deleting |
| `tailwind.config.snippet.js` (repo root) | knip: no importer. Same commit; referenced only by DESIGN-AUDIT, MIGRATION-PLAN and a comment in `tailwind.config.ts` | med | Same; move, don't delete |
| `scripts/build-paywall-validation.mjs` | knip: not in `package.json` scripts. It generates `supabase/tests/paywall_v2_validation.sql` (85fae70) | low | It's run by hand to rebuild that test SQL. **Recommend keep** (or add an npm script) |
| ~~`public/sw.js`~~ | **Not dead:** registered at `src/app/(app)/chat/page.tsx:779` (`navigator.serviceWorker.register('/sw.js')`); knip can't see a URL string | — | — |

## Batch 3 — Code unused anywhere (not even in its own file)

| Item | Evidence it's unused | Confidence | Risk if wrong |
|---|---|---|---|
| `SortToggle` default export (`src/components/SortToggle.tsx:14`) | Only `SortCaption` from that file is imported (`expenses/page.tsx:15`, `invoices/page.tsx:11`); the old toggle was superseded by the redesign's caption | high | None at runtime; `tsc` would catch a missed import |
| `useClock` (`src/components/recap/clock.ts:48`) | No caller; the story uses `createClock` | med-high | Low; recap slides use the clock object directly |
| `SCENARIO_LABELS` (`src/lib/recap/fixtures.ts:186`) | No reader; fixtures are used by tests through other exports | med | Low; test-only file |
| `CADENCES` (`src/lib/recurring.ts:11`) — **after smoke test** | No reader (the form lists the cadences itself) | med | Low; recurring code, so it waits for the smoke test |
| Re-exports in `src/lib/notify/recaps.ts:70` (`DEFAULT_RECAP_TZ`, `resolveTimeZone`, `localYmd`, `addDays`, `periodsEndingBefore`, `zonedMidnight`) — **after smoke test** | Re-exported from `lib/recap/dates`; nobody imports them from `notify/recaps` | med-high | Low (`tsc` catches it); part of the `/api/followups` recap step |

## Batch 4 — Exports used only inside their own file (drop `export`, keep the code)

Low value and low risk: `tsc` fails on any missed importer. Grouped by file.
**After smoke test:** `lib/notify/*`, `lib/recurring.ts`,
`lib/recurring-run.ts`, `lib/notify/recurring.ts`.

| File | Exports |
|---|---|
| `src/lib/notify/recaps.ts` — after smoke test | `rollUp`, `loadPeriodRows`, `loadRecapInput`, `buildOwnerRecaps`, `pushPick`, `recapEvent` |
| `src/lib/notify/draft-nudges.ts` — after smoke test | `localHour` |
| `src/lib/notify/index.ts` — after smoke test | `dedupeKey` |
| `src/lib/recurring.ts` — after smoke test | `ymdOf`, `ERROR_GIVE_UP_DAYS`, `monthlyAmount`, `AMOUNT_MAX` |
| `src/lib/colors.ts` | `luminance`, `contrastRatio`, `mixColors`, `adjustAccentForContrast`, `assertThemeContrast`, `darkenForWhite` |
| `src/lib/recap/*` | `audio.ts` `RecapAudio`; `columns.ts` `PEAK_LIFT`, `LABEL_Y`, `screenColumns`; `dates.ts` `DEFAULT_RECAP_TZ`; `fixtures.ts` `scenarioPeriod`, `scenarioInput`; `payload.ts` `TOP_CATEGORIES`, `LIST_MAX`, `NAME_MAX`, `PAYMENT_METHODS`; `rows.ts` `RECAP_LIST_COLS`, `RECENT_DAYS`, `isRecent` |
| `src/components/recap/anim.ts` | `SlideAnims` |
| `src/components/tutorial/*` | `mocks.tsx` `MockTabBar`, `Spotlight`; `persistence.ts` `TUTORIAL_VERSION`, `getSeenVersion`; `slides.tsx` `SLIDES` |
| `src/lib/pdf/*` | `build-summary.tsx` `supabaseSource`; `share.ts` `sharePayload`; `summary-template.tsx` `clip`, `INCOME_DISCLAIMER` |
| Other `src/lib` | `chat-storage.ts` `CHAT_STORE_BASE`, `HISTORY_BASE`; `financials.ts` `calculateSubtotal`, `calculateTaxAmount`; `json-guard.ts` `isolateJsonObject`; `keyboard.ts` `isTextEntry`; `list-sort.ts` `EXPENSES_GROUP_KEY`; `paywall.ts` `PAID_TIERS`; `products.ts` `isUnit`; `receipt.ts` `MAX_INPUT_BYTES`, `sha256Hex`; `stripe/server.ts` `STRIPE_API_VERSION`; `tts.ts` `voicesReady`, `pickVoice`, `cleanForSpeech`; `usage.ts` `usageLine`; `use-sheet-drag.ts` `DISMISS_PX`, `FLICK_PX_PER_MS` |
| Other components | `paywall/PaywallSlideshow.tsx` `DOTS_H` |
| Unused exported **types** (67) | Same treatment. Most in `lib/pdf/summary-template.tsx` (7), `lib/notify/recaps.ts` (6, after smoke test), `lib/recap/columns.ts` (4), `lib/pdf/build-summary.tsx` (4), `lib/tax-summary.ts` (3); the rest are one or two per file (full list: rerun `npx knip@5`) |

## Batch 5 — Feature flags (decision, not mechanical cleanup)

| Item | Evidence | Confidence | Risk if wrong |
|---|---|---|---|
| `RECAPS_LIVE` off branches (`lib/recaps-live.ts`; "Coming soon" in `RecapsCard`, the `/recaps` redirect, `PaywallModal` recap slide + row, `RecapProvider` inert, the cron's recap gating) | `NEXT_PUBLIC_RECAPS_LIVE` is set for Production; the off branches run only on previews and local dev | med (dead in production, live on previews) | Removing the flag turns recaps on for every preview, and previews share the production DB: opening a recap there stamps real rows. Recommend keeping it until previews have their own Supabase project (PUNCH-LIST) |
| `PAYWALL_ENABLED` off branches (`lib/paywall.ts`, chat cap checks, PaywallModal) | Paywall launched 2026-10-02; Production has the var | med | Same: previews without the var run paywall-off. Values weren't read (names only), so confirm Production is `true` before removing anything |

## Not dead (checked)

- **npm dependencies:** none unused. The packages with no `import` are tooling: `@types/*`, `typescript`, `postcss`, `autoprefixer`.
- **CSS:** every class and `@keyframes` in `globals.css` and `recap.css` is referenced. `onit-list-from-left/right` are built dynamically (`invoices/page.tsx:188`); `.jsx` is in a comment.
- **Env vars read by code but not set in Vercel** (`NEXT_PUBLIC_TRACE`, `NEXT_PUBLIC_TRACE_VERBOSE`, `NODE_ENV`, `VERCEL_ENV`): intentional. The trace flags are opt-in debug switches; the other two are set by the platform.
