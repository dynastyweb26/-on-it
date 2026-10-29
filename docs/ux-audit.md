# UX audit — eleven friction classes

_Static audit of `main` at `f2edaa7`, run 2026-10-29 on branch
`freebuff/51731cefd6b90275681ea9c9`. Read-only: no application code changed._

Scope: the eleven classes below, across every screen a signed-in owner uses
(Chat, Invoices/Estimates, Clients, Books, Expenses, Summary, Settings, the
public pay page) plus login/onboarding/reset-password. Findings are ordered by
how often an owner on a phone would hit them — not by severity.

Limitation: this is source reading, not device testing. Nothing here was
reproduced on hardware; there is no iOS Safari or keyboard in the workspace, so
the keyboard-overlap and offline rows are inferred from the code paths and from
the app's own documented behaviour in `src/lib/keyboard.ts`.

**Category key** — C1 blocking on the network · C2 blank/spinner loading ·
C3 fetch on mount, no cache · C4 no press/disabled state · C5 writes fail
offline · C6 blank screen or hidden action for a new account · C7 can submit
twice · C8 raw error text · C9 keyboard covers input · C10 dark-mode colour
breakage · C11 typed input lost on navigate.

**Optimistic column** — `UNSAFE` marks anything involving money, sending a
document, deletion, or a value the server decides (invoice numbers, statuses,
payment ledgers). Those must stay request-then-update; the rest could be
optimistic safely.

## Findings

| # | C | Hit | File:line | Finding | Optimistic |
|---|---|---|---|---|---|
| 1 | C3 | Every visit | `src/components/tabs/InvoicesView.tsx:169` (inside the `[active]` effect) | Up to 200 rows are re-fetched on every activation of the tab. Nothing is cached, so returning from a detail screen re-runs the query and re-shows `InvoicesSkeleton` (`:277`). | n/a |
| 2 | C3 | Every visit | `src/components/clients/ClientsList.tsx:61` | `client_summaries()` RPC on every activation; no cache, so Clients re-renders its `ListSkeleton` each visit. | n/a |
| 3 | C3 | Every visit | `src/app/(app)/expenses/page.tsx:109` and `:114` | Expenses re-fetch 200 rows on mount, then make a second round trip to batch-sign receipt URLs — the thumbnails pop in after the list. | n/a |
| 4 | C3 | Every visit | `src/components/tabs/BooksView.tsx:136` | Books re-runs its invoice/expense queries on mount; the tiles wait on `BooksTotalsSkeleton` (`:215`) every time. | n/a |
| 5 | C3 | Every visit | `src/app/(app)/summary/page.tsx` (profiles effect + the three-table `Promise.all`) | Four queries per open. Period switching is client-side once loaded, but nothing survives leaving the screen. | n/a |
| 6 | C2 | Every visit | `src/app/(app)/summary/page.tsx:291` | "Adding it up…" is a bare paragraph — the only screen with no skeleton at all. The hero figures then appear in one layout jump. | n/a |
| 7 | C2 | Every visit | `src/components/template/TemplateSheets.tsx:36` | The client picker's rows start `null` and render nothing while the RPC runs, so the sheet reads as "no clients" for a beat and is never marked busy. | n/a |
| 8 | C1 | Daily | `src/components/tabs/ChatView.tsx:3717` | "Looks right — send it" is disabled for the whole build-and-send round trip; the card cannot move to a sent-looking state until the server answers. | **UNSAFE** — sending |
| 9 | C7 | Daily | `src/app/(app)/settings/SettingsView.tsx:1037` | The draft-nudge toggle calls `save()` with no in-flight guard. Two fast taps send two overlapping profile updates; last-write-wins, so the switch can settle on the opposite of what the owner meant. | Safe to queue, needs a guard |
| 10 | C4 | Daily | `src/app/(app)/settings/SettingsView.tsx:1035` | The same switch has no `disabled`/`aria-busy` while saving: it looks dead for the round trip and invites the repeat tap that #9 describes. | n/a |
| 11 | C1 | Weekly | `src/components/invoice-detail/RecordPaymentSheet.tsx:271` | Save payment blocks on the write; the sheet holds the ledger entry back until the server confirms. | **UNSAFE** — money |
| 12 | C1 | Weekly | `src/components/estimates/EstimateDetail.tsx:541` | Convert to invoice blocks for the round trip. | **UNSAFE** — server decides the invoice number and rows |
| 13 | C1 | Weekly | `src/components/invoice-detail/InvoiceDetailScreen.tsx:776` (with `src/components/DeleteConfirmModal.tsx:130`) | Delete blocks on the round trip, behind the typed-DELETE gate. Correct, and it must stay non-optimistic. | **UNSAFE** — deletion |
| 14 | C7 | Weekly | `src/app/(app)/settings/PayoutsScreens.tsx:204` | Payment-method toggle calls `save()` directly from `onClick`, the same double-tap exposure as #9. | Safe, needs a guard |
| 15 | C8 | Weekly | `src/components/AddExpenseSheet.tsx:107` | `setAmountError(error.message)` prints the raw Postgres error under the amount field (e.g. an RLS or constraint message) instead of a human sentence. | n/a |
| 16 | C8 | Weekly | `src/app/reset-password/page.tsx:36` | `setError(error.message)` surfaces Supabase auth internals ("Auth session missing!", "New password should be different…") on the one screen where the user cannot do anything with them. | n/a |
| 17 | C5 | Weekly | `src/components/AddExpenseSheet.tsx:107` | An expense save with no connection fails outright: no queue, no retry, just the DB message. The form keeps its values, which is the one good part. | Safe (queue it) |
| 18 | C11 | Weekly | `src/components/clients/ClientForm.tsx:75` | `close()` is `router.back()`. There is no `beforeunload` or dirty guard anywhere in `src/`, so Back, the tab bar, or a swipe throws away every typed field without asking. | n/a |
| 19 | C11 | Weekly | `src/components/clients/ProductForm.tsx:61` | Same discard-on-navigate for a new or edited product/service. | n/a |
| 20 | C11 | Weekly | `src/components/recurring/RecurringForm.tsx:54` | Same, on the recurring-expense form. | n/a |
| 21 | C11 | Weekly | `src/app/login/page.tsx:42` | `<AuthSheet key={entry}>` is keyed by which sheet opened, so switching Get Started ↔ Sign in unmounts and rebuilds it: a typed email or password is lost. | n/a |
| 22 | C9 | Weekly | `src/components/invoice-detail/RecordPaymentSheet.tsx:126` | This sheet is missing `data-kb-fit`, so on iOS it is not pinned to the visible area and its inputs can end up under the keyboard. Its siblings do mark it: `AddExpenseSheet.tsx:122`, `AuthSheet.tsx:49`, `DeleteConfirmModal.tsx:55`, `PickerSheet.tsx:117`. | n/a |
| 23 | C9 | Weekly | `src/components/estimates/EstimateAttachments.tsx:494` | Same missing `data-kb-fit` on the attachment/caption sheet. | n/a |
| 24 | C4 | Weekly | `src/components/estimates/EstimateLinkActions.tsx:49` and `:52` | Copy and Share tiles have no busy or pressed state; if the clipboard is blocked they do nothing visible at all. | Safe |
| 25 | C5 | Weekly | `src/components/clients/ClientsList.tsx:82` | Offline delete removes the row, then silently puts it back when the write fails — no toast, so the row appears to refuse to delete. | **UNSAFE** — deletion (revert is correct; the silence is the gap) |
| 26 | C5 | Weekly | `src/app/(app)/expenses/page.tsx:177` | Same silent revert on a failed expense delete. | **UNSAFE** — deletion |
| 27 | C6 | Edge | `src/components/estimates/EstimateDetail.tsx:550` and `:553` | Share and Copy are disabled while the estimate is still a draft, with nothing on screen saying why. A brand-new account's first estimate shows a dead primary cluster next to a live action. | n/a |
| 28 | C6 | Edge | `src/components/invoice-detail/InvoiceDetailScreen.tsx:918` | Resend stays disabled until `shareReady` is true; the button gives no reason while it waits. | n/a |
| 29 | C10 | Always | `src/app/globals.css:15` | `color-scheme: light` is set at the root and there is not one `dark:` variant or `prefers-color-scheme` rule in `src/`. The app is light-only by force — which is why nothing breaks today, and why nothing would adapt if a theme were added. | n/a |
| 30 | C10 | Always | `src/components/paywall/PlanStep.tsx:31`, `src/app/onboarding/page.tsx:114`, `src/components/DeleteConfirmModal.tsx:65` | Hardcoded `bg-white` / inline `#fff8f0` surfaces bypass the design tokens, so they would not follow any theme, and a dark canvas behind them would look broken. | n/a |
| 31 | C10 | Always | `public/manifest.json` | `background_color: #fff8f0` and `theme_color: #d4af37` are fixed: the PWA splash and status bar stay cream and gold on a device in dark mode. | n/a |

## Checked and sound (so the table is not read as "everything is broken")

- **Optimistic with rollback already:** `SettingsView.tsx:326` (profile patch,
  revert + "Couldn't save" at `:647`), `ClientsList.tsx:82-84`,
  `ProductsList.tsx:75-77`, `expenses/page.tsx:177-185`, `ChatView.tsx:859`.
- **Skeletons exist on every list:** `InvoicesSkeleton`, `ListSkeleton`
  (`SavedList`), `ExpensesSkeleton`, `BooksTotalsSkeleton` (`BooksView.tsx:215`),
  `SettingsSkeleton`, `InvoiceDetailSkeleton`, `ChatRestoreSkeleton`. Summary is
  the only exception (#6).
- **Double-submit guards:** `DeleteConfirmModal.tsx:130` (`busy`),
  `RecordPaymentSheet.tsx:271` (`saving`), `SignSheet.tsx:55` (`!submitting`),
  `FeedbackScreen.tsx:27` (`!busy`), the chat's single-flight `phase`
  (`ChatView.tsx:1139`).
- **Keyboard plumbing is real and global:** `src/lib/keyboard.ts` mounted once,
  with `data-kb-fit` on eleven layers, `data-kb-hide` for the tab bar, and
  `data-kb-lift` for toasts. The two gaps are #22 and #23.
- **Offline is handled where it matters most:** `ChatView.tsx:1435`, `:1980`,
  `:2082`, `:2226` all say the draft is safe, and the draft really is persisted
  (`src/lib/chat-storage.ts`). No screen silently pretends a failed write landed.
- **New accounts get a way forward:** `InvoicesEmpty.tsx:21` (Open Chat),
  `SavedEmpty` in `ClientsList`, the summary empty block with
  "Capture a receipt" (`summary/page.tsx:301`), and `BooksView.tsx:191-195`
  distinguishes a genuinely empty account from "no invoices".

## Suggested order, if these get fixed

1. **#22/#23** — add `data-kb-fit` to the two sheets. Smallest diff, and typing
   under the keyboard is the failure that feels most broken.
2. **#9/#10/#14** — one in-flight guard for the settings toggles, reused by both.
3. **#15/#16** — replace the three raw `error.message` surfaces with sentences.
   Then **#18-#21** dirty guards, which are the largest behavioural change.
