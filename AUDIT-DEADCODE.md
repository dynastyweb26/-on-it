# Dead-code audit — 2026-10-08

Read-only audit. Nothing was deleted or changed except this file (branch
`chore/deadcode-audit`, cut from `main` @ `a4b991d`).

Merged report: this session's audit is the base, with the env-var and
feature-flag rows from a parallel audit of the same branch (`d8d9a4d`) added.

## Method

- `npx knip@5` (not added as a dependency), run twice: default mode (test files
  count as entry points) and `--production` (tests excluded).
- `tsc --noEmit --noUnusedLocals --noUnusedParameters`: **0** unused locals,
  imports or parameters.
- Every export knip flagged was grepped inside its own file, to sort "symbol is
  dead" from "symbol is used locally; only the `export` keyword is extra".
- Every class, `@keyframes` and custom property in `src/app/globals.css` and
  `src/components/recap/recap.css` was grepped across `src/` and `public/`, with
  template-string class names checked by hand.
- Every npm dependency was grepped across `src/`, `scripts/` and root configs.
- Every `/api/*` route was checked for a caller (fetch, cron, or an external
  webhook).
- `process.env.*` reads were compared with `.env.example`, the names in
  `.env.local`, and `vercel env ls` (names and scopes only; no values read).
- The `/api/followups` import graph was walked: `route.ts` → cron-auth,
  deploy-env, documents, expenses, financials, notify/{draft-nudges, index,
  recaps, recurring, render, types, webpush}, payment-methods, paywall,
  recap/{dates, payload}, recaps-live, recurring-run, recurring, supabase/admin,
  tax-summary. Anything in those files is in **Batch 5 (after smoke test)**.

**Headline:** the codebase is lean. Knip found **no orphaned components** (nothing
left over from the UI redesign is still a separate file), **no unused npm
dependencies**, and **no unused CSS classes**. The real dead code is a few
symbols, some static assets, and stale env vars.

---

## Batch 1: dead code and assets outside the cron path (safe first)

| Item | Evidence it's unused | Confidence | Risk if wrong |
|---|---|---|---|
| `SortToggle` default export (segmented Newest/A–Z control) plus its `OPTIONS` const, `src/components/SortToggle.tsx:9-38` | Knip: default export unused. Both importers (`invoices/page.tsx:11`, `expenses/page.tsx:15`) import only `SortCaption`. It was replaced by `SortCaption` in `f50ebc7` ("list to the release frames"). The last `<SortToggle` JSX was removed by `eb496d1` (2026-10-03). Keep the file and `SortCaption`; `Icon` is still used by `SortCaption`. | high | Build error only (no runtime path). PUNCH-LIST rows "Invoice/Expense sort toggle" still name `SortToggle`, so update them too. |
| `useClock` hook plus `useIsoLayoutEffect`, `src/components/recap/clock.ts:45-52` | Defined once and imported nowhere. Removing it also orphans the `useEffect`, `useLayoutEffect` and `useRef` imports on line 7. Check those aren't used elsewhere in the file. | high | Build error only. Slides subscribe through `SlideAnims` (anim.ts) instead. |
| `--onit-ink-raised` custom property, `src/components/recap/recap.css:16` | Defined; no `var(--onit-ink-raised)` anywhere in src, tailwind config, or tokens. | high | Purely visual; nothing reads it. |
| `public/icons/icon-16.png`, `public/icons/icon-48.png` | Not in `layout.tsx` metadata (which serves `favicon.ico` 16/32/48 + `icon-32.png` + `apple-icon-180.png`) or in `manifest.json`. Only `public/icons/README.md` mentions them. | high | A browser that ignores the .ico would fall back to icon-32. Negligible. |
| `public/icons/favicon-preview.png` | Referenced nowhere, not even in the README. | high | None (preview image for the design handoff). |
| `public/icons/onit-icon-maskable.svg` | Referenced nowhere. It's likely the source art for the maskable PNGs. | med | Loses the source vector for regenerating icons. Move it to `design/` instead of deleting. |
| `SCENARIO_LABELS`, `src/lib/recap/fixtures.ts:186` | Used nowhere, including tests. `fixtures.ts` is a test-only fixture (knip `--production` lists the whole file as unused; its only importer is `copy.test.ts`). Keep the file. | high | None. Only a leftover from the prototype's scenario picker. |

## Batch 2: env vars (Vercel dashboard and `.env*`, no code change)

| Item | Evidence it's unused | Confidence | Risk if wrong |
|---|---|---|---|
| `NEXT_PUBLIC_RECAPS_LIVE` scoped to **Preview (feat/recap)** | `feat/recap` is merged into `main` (`git branch --merged main`) and has had no commits for 6 days. A branch-scoped var only applies to deployments of that branch. | high | Re-deploying `feat/recap` itself would show recaps off. No other branch is affected. Note: generic Preview has **no** RECAPS_LIVE, so new preview branches run with recaps off. Decide whether you want a Preview-wide value instead. |
| `NEXT_PUBLIC_PAYWALL_ENABLED` scoped to **Preview (feat/paywall-v2)** | `feat/paywall-v2` is merged into `main` (`f026fdf`). Same reasoning. | high | None for other branches. The flag defaults to ON when unset (`paywall.ts:6`). |
| `NEXT_PUBLIC_EMAILJS_SERVICE_ID`, `_TEMPLATE_ID`, `_PUBLIC_KEY` (Production, `.env.local`, `.env.example`) | Zero reads in `src/` or `scripts/`, and no `emailjs` package. Email now goes through Resend (`lib/email/resend.ts`). Only the stale ONIT-SPEC infra line names EmailJS. | high | None in code. If something outside the repo uses them, it breaks, so copy the values somewhere before removing. They're public-by-design keys, so there's no secret exposure either way. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (Production + Preview, `.env.example`) | Zero reads; no `loadStripe` / Stripe.js in the app. `.env.example` says it's kept "for future Stripe.js/Elements use"; Checkout is a hosted redirect. | med | Low. It's intentional future-proofing; removing it means re-adding it when Elements lands. Your call. |
| `.env.example` drift (not dead; listed for completeness) | Read in code but missing from `.env.example`: `NEXT_PUBLIC_PAYWALL_ENABLED`, `PUSH_TEST_ENABLED`, `VAPID_SUBJECT`, `NEXT_PUBLIC_TRACE`, `NEXT_PUBLIC_TRACE_VERBOSE`. | — | Documentation gap only. Fix = add them, not delete. |
| Read by code but not set in Vercel (not dead) | `NEXT_PUBLIC_TRACE`, `NEXT_PUBLIC_TRACE_VERBOSE` are opt-in debug switches; `NODE_ENV`, `VERCEL_ENV` are set by the platform. | — | Intentional. |

## Batch 3: root design-handoff files

| Item | Evidence it's unused | Confidence | Risk if wrong |
|---|---|---|---|
| `tailwind.config.snippet.js` | Knip: unused file. Its own header says it's a merge-in fallback ("Merge into theme.extend"). The real `tailwind.config.ts` doesn't import it. | high | None at runtime. Loses a handoff artifact that docs cite (DESIGN-AUDIT, MIGRATION-PLAN). Move it to `design/` instead of deleting. |
| `tokens.css` | Knip: unused file. Not `@import`ed. `globals.css:7` only mentions it in a comment ("ported from tokens.css"). | high | Same as above. The docs (DESIGN-AUDIT, MOTION-SPEC, RECAP-SPEC) reference it as the token source of truth. Move it, don't delete it. |

## Batch 4: trim needless `export` keywords (outside the cron path, low value)

Each symbol below is **used inside its own file** but imported nowhere else.
Removing the `export` keyword changes no behaviour; it only shrinks the public
surface. Confidence high, risk: build error at worst. This batch is optional.

- **Values:** `EXPENSES_GROUP_KEY` (list-sort), `isUnit` (products), `DISMISS_PX`, `FLICK_PX_PER_MS` (use-sheet-drag), `scenarioPeriod`, `scenarioInput` (recap/fixtures), `TUTORIAL_VERSION`, `getSeenVersion` (tutorial/persistence), `luminance`, `contrastRatio`, `mixColors`, `adjustAccentForContrast`, `assertThemeContrast`, `darkenForWhite` (colors), `RecapAudio` (recap/audio), `PEAK_LIFT`, `LABEL_Y`, `screenColumns` (recap/columns), `RECAP_LIST_COLS`, `RECENT_DAYS`, `isRecent` (recap/rows), `sharePayload` (pdf/share), `CHAT_STORE_BASE`, `HISTORY_BASE` (chat-storage), `usageLine` (usage), `voicesReady`, `pickVoice`, `cleanForSpeech` (tts), `MAX_INPUT_BYTES`, `sha256Hex` (receipt), `supabaseSource` (pdf/build-summary), `clip`, `INCOME_DISCLAIMER` (pdf/summary-template), `STRIPE_API_VERSION` (stripe/server), `isolateJsonObject` (json-guard), `isTextEntry` (keyboard), `DOTS_H` (PaywallSlideshow), `SlideAnims` (recap/anim), `SLIDES`, `MockTabBar`, `Spotlight` (tutorial).
- **Types:** `TagDoc`, `ExtraInfo`, `EntryList`, `DividerGranularity`, `TemplateRow`, `Scenario`, `RecapAccess`, `SlideConfig`, `RecapConfig`, `OpenerSeries`, `Col`, `Pt`, `ScreenColumns`, `RenderSnapshotSource`, `CheckoutReturn`, `UsageKind`, `UsageSnapshot`, `TracePoint`, `SendState`, `ExpensePrefill`, `SummaryPdfOptions`, `Row`, `SummaryPdfProfile`, `SummaryPdfSource`, `ConnectStatus`, `CapabilityStatuses`, `SummaryRowData`, `ExpenseSummaryData`, `ExpenseDetailedData`, `IncomePaymentRow`, `IncomeClientBlock`, `IncomeSummaryData`, `IncomeTotalsData`, `AccessTier`, `AccessResult`, `RateRoute`, `TrialReminderInput`, `EmailContent`, `MenuItem`, `SavedItem`, `SkeletonProps`, `PaymentBrand`, `AnimKind`, `AnimOpts`, `PickRow`, `CreateArgs`, `TabKey`.

## Batch 5: AFTER SMOKE TEST (`/api/followups` graph and recurring code)

Don't touch these until the post-merge smoke test in PUNCH-LIST passes
(production `/api/recurring/test` → 404, and the next 15:00 UTC `/api/followups`
returns `recurring: {…}` with `errors: 0`).

| Item | Evidence it's unused | Confidence | Risk if wrong |
|---|---|---|---|
| `CADENCES`, `src/lib/recurring.ts:11` | Defined once; used nowhere, including tests (the form uses `CADENCE_LABEL`). | high | Build error only, but the file is on the cron path, so wait. |
| `NotifyEventType`, `src/lib/notify/types.ts:55` | Defined once; used nowhere. | high | Build error only. |
| `PaymentMethod` in the re-export at `src/lib/notify/index.ts:19` | Every consumer imports `PaymentMethod` from `./types` or `@/lib/notify/types` directly. Keep `NotifyEvent` and `ConnectProblem` in that line. | high | Build error only. |
| Re-export block `src/lib/notify/recaps.ts:69-72` (`DEFAULT_RECAP_TZ, resolveTimeZone, localYmd, addDays, periodsEndingBefore, zonedMidnight, RecapKind, RecapPeriod`) | Nothing imports these via `notify/recaps`; consumers use `@/lib/recap/dates`. The file has its own separate import from `recap/dates` (lines 57-59), so deleting the re-export doesn't break local use. Verified: the only importer of `@/lib/notify/recaps` is `followups/route.ts`, and it imports `runRecaps` alone. `RecapPeriod` is still used locally, so keep it in the local import. | high | Build error only. The comment on line 68 explains the re-export, so remove both. |
| Needless `export`s on the cron path: `ymdOf`, `ERROR_GIVE_UP_DAYS`, `monthlyAmount`, `AMOUNT_MAX`, `Upcoming` (recurring); `ItemRun` (recurring-run); `RecurringRun` (notify/recurring); `localHour` (draft-nudges); `dedupeKey` (notify/index); `rollUp`, `loadPeriodRows`, `loadRecapInput`, `buildOwnerRecaps`, `pushPick`, `recapEvent`, `RecapRunSummary`, `RecapNumbers`, `Built`, `OwnerRecaps` (notify/recaps); `DEFAULT_RECAP_TZ` (recap/dates); `TOP_CATEGORIES`, `LIST_MAX`, `NAME_MAX`, `PAYMENT_METHODS`, `RecapFlags` (recap/payload); `calculateSubtotal`, `calculateTaxAmount`, `FinancialTotals`, `LedgerDue` (financials); `PAID_TIERS` (paywall); `DocumentKind` (documents); `IncomeSummary`, `CategoryTotal`, `Summary` (tax-summary); `DeployEnv` (deploy-env) | All used in their own file; no outside importer. | high | Build error only. Optional cleanup. |

---

## Feature flags (decision, not mechanical cleanup)

| Item | Evidence | Confidence | Risk if wrong |
|---|---|---|---|
| `RECAPS_LIVE` off branches (`lib/recaps-live.ts`; "Coming soon" in `RecapsCard`, the `/recaps` redirect, `PaywallModal` recap slide + row, `RecapProvider` inert, the cron's recap gating) | `NEXT_PUBLIC_RECAPS_LIVE` is set for Production; the off branches run only on previews and local dev. | med (dead in production, live on previews) | Removing the flag turns recaps on for every preview, and **previews share the production DB**: opening a recap there stamps real `recaps` rows. Keep the flag until previews have their own Supabase project. Touches `notify/recaps.ts`, so after the smoke test regardless. |
| `PAYWALL_ENABLED` off branches (`lib/paywall.ts`, chat cap checks, `PaywallModal`, `access.ts`, trial-reminders) | Paywall launched 2026-10-02; Production has the var. | med | Unset means ON (`paywall.ts:6`), so the off path only runs if someone sets it to `"false"`: it's a kill switch. Values weren't read, so confirm Production isn't `"false"` before removing anything. |

## Checked and NOT dead (no action)

| Item | Why it stays |
|---|---|
| `public/sw.js` | Service worker (knip false positive). Registered at `chat/page.tsx:779` and from `/install`. |
| `scripts/build-paywall-validation.mjs` | Not in `package.json`, but it generates `supabase/tests/paywall_v2_validation.sql` (header documents `node scripts/…`). Optional: add a `db:paywall-test` npm script so it stops looking orphaned. |
| Other `scripts/*.mjs` | Run by `package.json` scripts (knip `--production` only lists them because it ignores scripts). |
| `public/splash/launch-*.png` (44) | Referenced dynamically (`layout.tsx:61`, `launch-${pw}x${ph}.png` from `lib/launch-screens.json`). PUNCH-LIST row 42 says iOS ignores them on this install. Dropping the whole launch-image pipeline is a product decision, not dead-code removal. |
| `.onit-list-from-left/right` (globals.css) | Built at runtime: `invoices/page.tsx:188` uses `` `onit-list-from-${travel}` ``. |
| All other CSS classes, every `@keyframes` | Each has at least one reference. |
| All npm deps | Each is imported (`autoprefixer` via `postcss.config.mjs`, `svgo` via `build-splash-paths.mjs`, `server-only` in 3 files). |
| `RECAPS_LIVE` / `NEXT_PUBLIC_RECAPS_LIVE` (Production) | Live launch switch, read in 4 modules. **Founder to confirm:** PUNCH-LIST row 461 says "Built — off", but row 536 has recaps verified on production on 2026-10-09 and the Production var was created 6 days ago. If it's `true` in Production and recaps are staying on, the `!RECAPS_LIVE` branches become removable later. That's a separate, deliberate change, and it touches `notify/recaps.ts` (after the smoke test). |
| `PAYWALL_ENABLED`, `STRIPE_CONNECT_ENABLED`, `PUSH_TEST_ENABLED`, `NEXT_PUBLIC_TRACE(_VERBOSE)` | All read. They're kill switches or preview-only gates, which is intended. |
| `/api/*` routes | Every route has a fetch caller, a cron (`followups`, `trial-reminders`), or is a Stripe webhook target. `/api/recurring/test` and `/api/push/test` are preview-only test routes (404 in production), so keep them. |
| `src/lib/recap/fixtures.ts` | Test fixture for `copy.test.ts` (only its dead `SCENARIO_LABELS` is in Batch 1). |
| `design/`, `design-reference/`, root `*-SPEC.md` / audit docs | Reference material, not code; out of scope. |
