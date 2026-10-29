# On It — UX Audit (eleven categories)

Audited branch: `freebuff/d40954cab8fc258b5acbfeb7` (base `main`), 2026-10-29.
Method: read-only. Screens, forms, sheets, routes and shared primitives were read in
`src/app`, `src/components`, `src/lib`. No code was changed. No database, Vercel or
Stripe action was taken.

**UNSAFE** below means: never optimistic. Money, sending an invoice/estimate,
deletion, or a value the server decides (invoice number, status, totals,
`amount_paid`, Stripe state).

---

## Read this first: what is already built

Do not re-do these. They change the shape of the fix prompts.

| Already exists | Evidence |
| --- | --- |
| Light mode is locked in one place | `src/app/layout.tsx:124` (`colorScheme: 'light'`), `:135` (inline cream + `colorScheme`), `public/manifest.json:7-8` (`background_color` `#fff8f0`, standalone/launch), `src/app/globals.css` mirrors the cream canvas |
| App-wide keyboard avoidance | `src/components/KeyboardAvoider.tsx` mounted at `src/app/layout.tsx:178`; logic in `src/lib/keyboard.ts` (scroll-into-view, `data-kb-fit`, `data-kb-hide`, `data-kb-lift`) |
| Skeletons for the main lists | `Skeleton.tsx`, `InvoicesSkeleton`, `BooksTotalsSkeleton`, `ExpensesSkeleton`, `InvoiceDetailSkeleton`, `SettingsSkeleton`, `ChatRestoreSkeleton`, `ListSkeleton` |
| Empty states with a primary action | `InvoicesEmpty` (Open Chat), `SavedEmpty` (Add client), Books summary empty (Capture a receipt), recurring empty (Add recurring expense) |
| Finalize idempotency (server) | `supabase/migrations/20260827024826_invoice_finalize_idempotency_key.sql`; client sends `finalize_key: convoId` at `ChatView.tsx:1940` |
| Stripe-side idempotency | `src/app/api/pay/[token]/checkout/route.ts:198`; `src/lib/stripe/connect.ts:32` |
| Safe optimistic writes | `SettingsView.tsx:324` (snapshot + rollback), `ClientsList.tsx:85` (remove + rollback), `expenses/page.tsx:172` (delete + rollback), `InvoiceDetailScreen.tsx:607` (notes/lines set state first) |
| Chat draft persistence | `ChatView.tsx:461-509` (localStorage, namespaced per user, guest adoption) |
| Chat offline copy | `ChatView.tsx:1435`, `1980`, `2004`, `2082`, `2226` (`navigator.onLine` branches) |
| Global press/disabled styles | `src/app/globals.css:60-76` (`active:scale`, `disabled:opacity-40`) |

Consequence: **#10 has zero open items**, **#9 is mostly handled**, **#2 is mostly
handled**, and **#1 is partly done**. The rows below are only the real gaps.

---

## The full table, ordered by how often a user hits it

Frequency = how often an ordinary active user meets it, not severity.

| # | Cat | File:line | What the user experiences | Frequency | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | 3 | `src/components/tabs/InvoicesView.tsx:140-173` | Every return to the Invoices/Estimates tab re-queries up to 200 rows and shows the skeleton again. No cached copy, so the list "reloads" constantly. | Every tab switch | Safe |
| 2 | 3 | `src/components/tabs/BooksView.tsx:134-182` | Books re-runs three full-table queries (invoices, `invoice_payments`, expenses) on every activation; totals skeleton every time. | Every tab switch | Safe (read-only) |
| 3 | 3 | `src/components/clients/ClientsList.tsx:55-66` | Clients re-calls `client_summaries()` RPC on every activation; rows go back to `null` → full skeleton. | Every tab switch | Safe |
| 4 | 3 | `src/app/(app)/expenses/page.tsx:100-118` | Expenses list + batched signed receipt URLs refetched on every mount. | Every visit | Safe |
| 5 | 2 | `src/app/(app)/summary/page.tsx:247,291` | The only non-skeleton loader left: "Adding it up…" centred text where the table will be. | Every visit | Safe |
| 6 | 3 | `src/app/(app)/summary/page.tsx:101-160` | Three queries on mount (expenses, payments, owed) with no cached copy. | Every visit | Safe |
| 7 | 3 | `src/app/(app)/vault/page.tsx:31` | Vault re-queries `vault_documents` (limit 300) on every mount. | Every visit | Safe |
| 8 | 3 | `src/app/(app)/dashboard/recurring/page.tsx:37-41` | Recurring list refetched on mount; no cache. | Every visit | Safe |
| 9 | 3 | `src/app/(app)/settings/SettingsView.tsx:249` | Profile row refetched on every settings activation; skeleton each time. | Every settings visit | Safe |
| 10 | 3 | `src/components/recurring/useRecurringItems.ts:17` | Books fires an additional `recurring_expenses` query on every activation, separate from `loadStats`. | Every Books visit | Safe |
| 11 | 2 | `src/app/(app)/vault/page.tsx:31,57-58` | Vault has **no loading state**: while the query is in flight it already renders the empty copy "Every invoice you send lands here automatically." A failed fetch looks identical to a real empty account. | Every visit | Safe |
| 12 | 6 | `src/app/(app)/vault/page.tsx:57-58` | Vault's empty state is text only — no primary action, no "Open Chat" / "Snapshot a receipt". | New account | Safe |
| 13 | 6 | `src/app/(app)/dashboard/recurring/page.tsx:39,88-98` | A failed fetch sets `rows = []`, which renders the *empty* state "No recurring expenses" instead of an error; the failure banner is optional and the empty state still invites creation. | On failure | Safe |
| 14 | 7 | `src/app/(app)/settings/SettingsView.tsx:324-349` | `save()` has no in-flight guard. Tab/blur quickly across fields (or tap a toggle twice) and requests interleave; a late failure rolls `p` back to a stale snapshot and can visually undo a newer successful edit. | Every settings edit | Safe to guard |
| 15 | 7 | `src/components/tabs/ChatView.tsx:1133-1139` | Send guard is React state (`phase`); the code comment admits a sub-frame double-tap can slip one turn through. | Every chat send | Safe to guard |
| 16 | 4 | `src/components/SegmentedControl.tsx:15,29-33` | Week/Month (expenses) and frequency segments are 36px tall and have **no pressed state at all** — no `active:` class. | Every expenses/recurring visit | Safe |
| 17 | 4 | `src/components/clients/ProductForm.tsx:138-141` | Unit buttons (each/hour/sq ft/job) are `h-10` = 40px, under the 44px target. | Every new item | Safe |
| 18 | 4 | `src/app/(app)/vault/page.tsx:60` | Document rows are plain buttons: no pressed state, no minimum row height. | Every vault visit | Safe |
| 19 | 8 | `src/app/onboarding/page.tsx:287` | A failed profile upsert shows raw Postgres/PostgREST text (`dbErr.message`) on the last onboarding step. | On save failure | Safe (copy) |
| 20 | 8 | `src/components/auth/useEmailAuth.ts:144` | Sign-in/sign-up shows Supabase's own `error.message` verbatim (the auth library's raw text). | On auth failure | Safe (copy) |
| 21 | 8 | `src/app/reset-password/page.tsx:36` | Password reset shows `error.message` from Supabase verbatim. | On reset failure | Safe (copy) |
| 22 | 8 | `src/components/auth/AuthSheet.tsx:39` | Apple/Google OAuth failure shows the provider's raw `error.message`. | On OAuth failure | Safe (copy) |
| 23 | 8 | `src/components/AddExpenseSheet.tsx:107` | Any expense insert error is written into the amount field as `error.message` (raw DB text), except the paywall hint. | On save failure | Safe (copy) |
| 24 | 8 | `src/app/(app)/settings/BankTransferCard.tsx:52` | Server `json.error` strings are passed through to the user whenever they aren't exactly `"save failed"`. | On save failure | Safe (copy) |
| 25 | 8 | `src/app/(app)/settings/help/feedback/FeedbackScreen.tsx:46` | Server response `r.message` is rendered directly. | On send failure | Safe (copy) |
| 26 | 8 | `src/components/invoice-detail/InvoiceDetailScreen.tsx:537` | "The share sheet didn't open (`NotAllowedError`)" — a raw exception `name` inside user-facing copy. | On share failure | Safe (copy) |
| 27 | 5 | `src/components/invoice-detail/RecordPaymentSheet.tsx:125-131` | Offline, `onSave` resolves `false`; the sheet only calls `setSaving(false)`. **No error message at all** — the payment silently doesn't record. | Offline | UNSAFE (money) |
| 28 | 5 | `src/components/invoice-detail/InvoiceDetailScreen.tsx:776-786` | Offline delete: the awaited update fails, but the modal closes and nothing is shown; the invoice simply stays. | Offline | UNSAFE (deletion) |
| 29 | 5 | `src/components/clients/ClientForm.tsx:90,104` | Offline save fails with a generic "check your connection" and no retry; nothing is queued. | Offline | Safe (queue candidate) |
| 30 | 5 | `src/components/clients/ProductForm.tsx:90` | Same: offline item save fails outright, no queue. | Offline | Safe |
| 31 | 5 | `src/components/recurring/RecurringForm.tsx:83-86` | Same: offline recurring save fails outright, no queue. | Offline | Safe |
| 32 | 5 | `src/app/(app)/expenses/page.tsx:172-190` | Offline delete removes the row optimistically, then silently re-adds it on error with no toast ("it came back"). | Offline | UNSAFE (deletion) |
| 33 | 11 | `src/components/clients/ClientForm.tsx:43,74` | New/Edit client holds everything in `useState`; Cancel/back (or an accidental swipe) discards typed name/phone/email/address/notes. | While typing, then leaving | Safe |
| 34 | 11 | `src/components/clients/ProductForm.tsx:43-46,61` | New/Edit item loses name, price, unit and description on back. | While typing, then leaving | Safe |
| 35 | 11 | `src/components/recurring/RecurringForm.tsx:40-54` | New/Edit recurring loses vendor, amount, cadence, date, toggle. | While typing, then leaving | Safe |
| 36 | 11 | `src/components/AddExpenseSheet.tsx:35-41` | Closing the sheet (scrim tap / X) discards amount, category, note and date. | Every add-expense abandon | Safe |
| 37 | 11 | `src/app/(app)/settings/BankTransferCard.tsx:39-45` | Routing/account numbers typed but not saved are lost on navigation. | While typing, then leaving | Safe (never persist accounts; prompt instead) |
| 38 | 11 | `src/app/(app)/settings/help/feedback/FeedbackScreen.tsx:22-46` | Feedback text is lost on Back. | While typing, then leaving | Safe |
| 39 | 11 | `src/app/onboarding/page.tsx:140` | Five-step onboarding state is in memory only; a reload at step 4 restarts at step 1. | Every reload mid-onboarding | Safe |
| 40 | 11 | `src/app/(app)/settings/SettingsView.tsx:734-762` | Business fields only persist on **blur**; navigate away with the field still focused and the last edit is lost. | Every settings edit | Safe |
| 41 | 6 | `src/app/(app)/expenses/page.tsx:236-243` | Zero-expense empty state is copy only — no "Add expense" / "Open Chat" action, even though the header "+" exists. | New account | Safe |
| 42 | 1 | `src/components/invoice-detail/InvoiceDetailScreen.tsx:447-476` | Payment is written, then the invoice is refetched, then UI updates. No optimistic row. | Every payment | UNSAFE (money, server totals) |
| 43 | 1 | `src/components/estimates/EstimateDetail.tsx:288-331` | Convert-to-invoice inserts server-side and waits; UI shows "Converting…". | Every conversion | UNSAFE (money, server number) |
| 44 | 1 | `src/components/clients/ProductForm.tsx:99-107` | Item delete awaits the update, then navigates; no optimistic removal. | Every item delete | UNSAFE (deletion) |
| 45 | 1 | `src/components/recurring/RecurringForm.tsx:92-100` | Recurring stop awaits, then navigates. | Every stop | UNSAFE (deletion) |
| 46 | 9 | `src/app/(app)/settings/PayoutsScreens.tsx:273` | Zelle field accepts a phone **or email** but has no `type`/`inputMode`, so iOS shows the default keyboard. | Every Zelle edit | Safe |
| 47 | 9 | `src/app/(app)/vault/page.tsx:55` | Vault search is a bare input (no `type="search"` / `enterKeyHint`), so no search key on the keyboard. | Every vault search | Safe |
| 48 | 9 | `src/app/(app)/settings/PayoutsScreens.tsx:327` | Payout handles have no `autoCapitalize="none"`/`autoCorrect="off"`, so the keyboard capitalises handles. | Every payout edit | Safe |
| — | 10 | `src/app/layout.tsx:124,135`; `public/manifest.json:7-8` | **No finding.** App, status bar, launch screen and canvas are already locked light (`colorScheme: 'light'`, cream inline, cream manifest). No `dark:` variants exist. | — | Already done |

### Counts by category

| Cat | Open rows | Notes |
| --- | --- | --- |
| 1 Optimistic UI | 4 | 3 are UNSAFE; only "already-optimistic" safe writes exist today |
| 2 Skeletons | 2 | 6 skeleton components already shipped; Vault + summary are the gaps |
| 3 Local cache | 8 | No cache layer exists anywhere; all reads are mount-fetch |
| 4 Press / disabled | 3 | Global btn styles exist; small controls and bare rows are the gaps |
| 5 Offline writes | 6 | No write queue exists; only chat detects `navigator.onLine` |
| 6 Empty states | 3 | Two false-empty-on-failure bugs, two missing actions |
| 7 Double submit | 2 | Most forms already guard; settings save and chat are the gaps |
| 8 Raw errors | 8 | Five are auth/library messages, three are DB/server passthroughs |
| 9 Keyboard | 3 | Global avoider handles coverage; only keyboard *type* gaps remain |
| 10 Dark mode | 0 | Locked already |
| 11 Lost drafts | 8 | Only chat persists anything |

---

## UNSAFE registry (never optimistic)

- `InvoiceDetailScreen.tsx:447` record payment — money + server-recomputed `amount_paid`
- `InvoiceDetailScreen.tsx:489` delete payment — money ledger
- `InvoiceDetailScreen.tsx:544` invoice send — server owns status + snapshot
- `InvoiceDetailScreen.tsx:776` delete invoice — deletion
- `EstimateDetail.tsx:247` estimate send — server owns status/token
- `EstimateDetail.tsx:288` convert to invoice — creates a numbered document
- `ChatView.tsx:1742` finalize/send — server assigns invoice number; has `finalize_key`
- `PayoutsScreens.tsx` payout/bank writes — money routing
- `settings/plan/cancel/*` — subscription money
- `api/delete-account` — deletion

---

## Suggested cut (do not approve all eleven)

Ranked by hits per user, restrained to what one review can absorb:

1. **#3 local cache** — the single biggest felt improvement (every tab switch), and it composes with #2.
2. **#2 skeletons** — only Vault + summary left; tiny after #3 lands.
3. **#8 raw errors** — 8 small copy changes; five are auth-library text.
4. **#7 double submit** — 2 real gaps; the money/send paths already have server idempotency.
5. **#6 empty states** — 3 rows, two of them false-empty-on-failure bugs.
6. **#4 press states** — 2 controls + Vault rows; resize commit separate.
7. **#11 lost drafts** — 8 forms, mechanical; exclude password/account fields.
8. **#9 keyboard types** — 3 one-line attribute changes.
9. **#1 optimistic** — only if a safe list is approved; everything money/send/delete stays UNSAFE.
10. **#5 offline queue** — plan first, single write only, as instructed.
11. **#10 dark mode** — closed; post-launch list.

---

## Appendix — voice input (Step 4 audit)

**Speech API:** AssemblyAI pre-recorded v2. `src/app/api/transcribe/route.ts:1-4`
declares it, uploads to `/v2/upload` (:89), creates `/v2/transcript` (:96-100) with
**only** `{ audio_url, language_detection: true }`, then polls (:104-120). No
`keyterms_prompt`, `word_boost`, `boost_param` or `custom_spelling` is sent.

**Where the transcript becomes invoice fields:**
`ChatView.tsx:2857-2912` records with `MediaRecorder`, POSTs the blob to
`/api/transcribe`, then calls `send(text, 'voice')` (:2908). `send()`
(`ChatView.tsx:1133`) POSTs to `/api/parse` (:1203). That route sanitizes history and
calls `extract()` in `src/lib/ai.ts` (Claude Haiku 4.5, `MODEL` at `ai.ts:8`), which
returns `ExtractResult`; `ChatView.tsx:1374` merges it into the draft that renders the
invoice card. So the transcript is parsed once, in `lib/ai.ts`, not in the client.

**Hint support:** yes. AssemblyAI's submit API accepts:
- `keyterms_prompt: string[]` — up to 200 terms (Universal-2) / 1000 (Universal-3.5 Pro), max 6 words per phrase.
- `custom_spelling: { from: string[]; to: string }[]` — fixes spelling/casing; `to` is one word, `from` max 5 words.
- `word_boost` + `boost_param` (older boost pair) also still present in the schema.

The app currently uses none of them, so recognition is unbiased toward client names
and line items.

**Smallest design (plan only, no code):**
1. `src/lib/voice-hints.ts` — pure `buildVoiceHints({ clients, products, limit })`:
   trim, drop <3 chars, dedupe case-insensitively, cap 6 words, cap ~50 entries.
2. Server, signed-in only: in `/api/transcribe`, one query for the 25 most recent
   clients (by last invoice/payment) + 25 saved products; memoize per user for 60s.
   Guests get no hints (no data, and it keeps the free demo cheap).
3. Pass the list as `keyterms_prompt` on the transcript create call. Keep
   `language_detection: true`.
4. Optional casing pass with `custom_spelling` for single-token names only.
5. Log only `{ hintCount }` to trace — never the names.

**If hints underperform:** post-transcription fuzzy match on `result.client_name`
inside `/api/parse` (normalized Levenshtein/Jaro-Winkler against saved clients,
accept only above a high threshold, only for the client field). Do **not** rewrite the
raw transcript — that would corrupt job descriptions. Show the plan before coding; a
SECURITY.md review is needed because client names would leave the app inside the
AssemblyAI request.
