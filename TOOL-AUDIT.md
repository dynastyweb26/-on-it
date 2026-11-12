# On It AI Smart Tool Registry Audit

- Audit date: 2026-11-11
- Base: `main` at `139bff360070dc3d01be73333845f0de94eb6d54`
- Output branch: `docs/tool-audit`
- Scope: read-only source audit. No code, migration or dependency changes. The app was not run.
- `feat/alive-fidelity`: no branch ref exists locally or remotely. It is already merged into main by commit `bd0c723` ("Merge origin/feat/alive-fidelity into the Record a payment button work"), so no row below is marked "alive-fidelity only".
- Method: every file named in a row was opened. Claims that depend on deployment state or on a file not opened are marked "unverified".
- Row granularity: one row per user-visible control. Repeated row-level open, delete and undo controls are counted once per surface. A grouped row is not a claim that the surface has only one control.

## A. UI actions

### A1. Chat

| action | component file | route, RPC or table it hits | type | risk | confirm step today | idempotent today |
|---|---|---|---|---|---|---|
| A1. Send a typed message | `src/components/tabs/ChatView.tsx` | `/api/route`, then `/api/parse` or `/api/ask` | send | high | no | no |
| A2. Send a voice turn | `src/components/tabs/ChatView.tsx` | `/api/transcribe`, then `/api/route` and `/api/parse` or `/api/ask` | send | high | no | no |
| A3. Send "?" / help | `ChatView.tsx`, `src/lib/chat-commands.ts` | local `matchCommand`; no route | read | low | no | n/a |
| A4. Ask for a recap | `ChatView.tsx`, `src/components/chat/recap-load.ts` | reads `invoices`, `expenses`, `invoice_payments` | read | low | no | n/a |
| A5. Pick a starter chip | `ChatView.tsx` | local `prefillFor`; no route | nav | low | no | n/a |
| A6. Open "+" and pick New invoice or New estimate | `ChatView.tsx`, `src/components/ComposerMenu.tsx` | local; replacing a saved template soft-deletes its `invoices` row | nav | medium | no | n/a |
| A7. Open "+" and pick Record expense | `ChatView.tsx`, `ComposerMenu.tsx` | local expense draft; no write until Save | write | medium | no | n/a |
| A8. Take or upload a receipt photo | `ChatView.tsx` | `/api/parse-receipt` | read | medium | no | n/a |
| A9. Open the record-payment card | `ChatView.tsx` | `client_summaries` RPC and `invoices` select | read | medium | no | n/a |
| A10. Confirm, undo or delete a chat payment | `ChatView.tsx`, `src/components/chat/PaymentCard.tsx` | `invoice_payments` insert or update | write | high | yes | yes |
| A11. Edit line items, tax, deposit or notes on the draft card | `ChatView.tsx`, `src/components/LineItemsEditor.tsx` | local draft; written on Send | write | medium | no | n/a |
| A12. Send an invoice or estimate from the card | `ChatView.tsx` | `invoices` insert/update with `finalize_key`, then `/api/invoices/[id]/send` or `/api/estimates/[id]/send` | send | high | yes | no |
| A13. Download or share an invoice PDF | `ChatView.tsx`, `src/components/invoice-detail/PdfSendCard.tsx` | local PDF build and Web Share; no server PDF route | send | medium | no | n/a |
| A14. Unsent share: retry, mark sent, or keep draft | `ChatView.tsx` | `POST /api/invoices/[id]/send` | send | high | no | no |
| A15. Close or discard a template | `ChatView.tsx` | `invoices` soft delete through `deleted_at` | write | medium | yes when content exists | yes |
| A16. Save a client, item or recurring expense from a prompt | `ChatView.tsx`, `src/components/SavePromptCard.tsx` | `save_client` RPC, `products` update, `recurring_expenses` insert | write | medium | no | partial |
| A17. Open history or start a new chat | `ChatView.tsx` | localStorage, plus `invoices` read to relink the conversation | nav | low | no | n/a |
| A18. Sign in from chat | `ChatView.tsx`, `src/components/chat/SignInChatButton.tsx` | `/login` | nav | low | no | n/a |
| A19. Open an event card or owner card | `ChatView.tsx`, `src/components/chat/EventCard.tsx` | `/invoices/[id]`; `events` read and optional mark | nav | low | no | n/a |

### A2. Invoices and Estimates

| action | component file | route, RPC or table it hits | type | risk | confirm step today | idempotent today |
|---|---|---|---|---|---|---|
| A20. Switch the Invoices/Estimates segment | `src/components/tabs/InvoicesView.tsx` | local | nav | low | no | n/a |
| A21. Filter or sort the document list | `InvoicesView.tsx` | local | read | low | no | n/a |
| A22. Open an invoice | `InvoicesView.tsx` | `/invoices/[id]` | nav | low | no | n/a |
| A23. Open an estimate | `InvoicesView.tsx` | `/estimates/[id]` | nav | low | no | n/a |
| A24. Start a new invoice or estimate | `InvoicesView.tsx` | `/chat?template=...` | nav | low | no | n/a |
| A25. Send or resend an invoice | `src/components/invoice-detail/InvoiceDetailScreen.tsx` | `POST /api/invoices/[id]/send` (marks sent; delivery is the client share) | send | high | yes | no |
| A26. Send the payment link only | `InvoiceDetailScreen.tsx` | `POST /api/invoices/[id]/send` | send | high | yes | no |
| A27. Record a payment | `InvoiceDetailScreen.tsx`, `src/components/invoice-detail/RecordPaymentSheet.tsx` | `invoice_payments` insert through `recordPaymentOnce` | write | high | yes | yes |
| A28. Delete or undo a payment | `InvoiceDetailScreen.tsx` | `invoice_payments` update or delete | write | high | no | yes |
| A29. Delete or undo an invoice | `InvoiceDetailScreen.tsx` | `invoices.deleted_at` update | write | high | yes | yes |
| A30. Edit the due date | `InvoiceDetailScreen.tsx` | `invoices.update` | write | low | no | yes |
| A31. Edit notes or private notes | `InvoiceDetailScreen.tsx` | `invoices.update` | write | low | no | yes |
| A32. Edit the deposit | `InvoiceDetailScreen.tsx` | `invoices.update` | write | medium | no | yes |
| A33. Add or remove an invoice attachment | `InvoiceDetailScreen.tsx`, `src/components/AttachmentsEditor.tsx` | `vault_documents` insert, storage upload, row delete | write | medium | no | no |
| A34. Download the invoice PDF | `InvoiceDetailScreen.tsx` | local PDF build; no server PDF route | read | low | no | n/a |
| A35. Send an estimate | `src/components/estimates/EstimateDetail.tsx` | `POST /api/estimates/[id]/send` (marks sent; delivery is the client share) | send | high | yes | no |
| A36. Preview the estimate as the client | `EstimateDetail.tsx` | `GET /api/estimates/[id]/preview` | read | low | no | n/a |
| A37. Copy or share the estimate link | `EstimateDetail.tsx`, `src/components/estimates/EstimateLinkActions.tsx` | local clipboard and Web Share | send | low | no | n/a |
| A38. Extend the estimate validity | `EstimateDetail.tsx` | `POST /api/estimates/[id]/extend` | write | medium | yes | yes |
| A39. Revoke the estimate link | `EstimateDetail.tsx` | `POST /api/estimates/[id]/revoke` | write | high | yes | yes |
| A40. Edit a sent estimate | `EstimateDetail.tsx` | `POST /api/estimates/[id]/edits` | write | high | yes | yes |
| A41. Convert an estimate to an invoice | `EstimateDetail.tsx`, `src/lib/estimates/convert-client.ts` | `invoices` insert with `finalize_key = convert-<estimate id>` | write | high | yes | yes |
| A42. Add or remove an estimate attachment | `src/components/estimates/EstimateAttachments.tsx` | presign, confirm and delete attachment routes | write | medium | no | no |

### A3. Clients / Products & Services / Recurring expenses

| action | component file | route, RPC or table it hits | type | risk | confirm step today | idempotent today |
|---|---|---|---|---|---|---|
| A43. Search clients | `src/components/clients/ClientsList.tsx` | local filter over `client_summaries` | read | low | no | n/a |
| A44. Add a client | `src/components/clients/ClientForm.tsx` | `save_client` RPC | write | medium | no | yes |
| A45. Edit a client | `ClientForm.tsx` | `clients.update` | write | medium | no | yes |
| A46. Delete or undo a client | `ClientsList.tsx` | `clients.update` through `deleted_at` | write | high | no | yes |
| A47. Open a client detail | `ClientsList.tsx` | `/clients/[id]` | nav | low | no | n/a |
| A48. Call or email a client | `src/app/(app)/clients/[id]/page.tsx` | `tel:` or `mailto:` | nav | low | no | n/a |
| A49. Search products | `src/components/clients/ProductsList.tsx` | local filter over `products` | read | low | no | n/a |
| A50. Add a product or service | `src/components/clients/ProductForm.tsx` | `products` insert or upsert on `name_key` | write | medium | no | yes |
| A51. Edit or duplicate a product | `ProductForm.tsx`, `ProductsList.tsx` | `products.update` or insert | write | medium | no | no for insert |
| A52. Delete or undo a product | `ProductsList.tsx` | `products.update` through `deleted_at` | write | medium | no | yes |
| A53. List recurring expenses | `src/app/(app)/dashboard/recurring/page.tsx` | `recurring_expenses` select | read | low | no | n/a |
| A54. Add a recurring expense | `src/components/recurring/RecurringForm.tsx` | `recurring_expenses` insert | write | medium | no | no |
| A55. Edit a recurring expense | `RecurringForm.tsx` | `recurring_expenses.update` | write | medium | no | yes |
| A56. Stop, delete or undo a recurring expense | `RecurringForm.tsx`, recurring page | `recurring_expenses.deleted_at` update | write | high | yes | yes |

### A4. Books / Expenses / Income / bank review

| action | component file | route, RPC or table it hits | type | risk | confirm step today | idempotent today |
|---|---|---|---|---|---|---|
| A57. Add an expense | `src/components/AddExpenseSheet.tsx` | `expenses` insert | write | medium | no | no |
| A58. Delete or undo an expense | `src/components/ledger/ExpensesPane.tsx` | `expenses.deleted_at` update | write | high | yes | yes |
| A59. View an expense receipt | `ExpensesPane.tsx` | storage read | read | low | no | n/a |
| A60. Add other income | `src/components/income/IncomeSheet.tsx` | `POST /api/income` | write | medium | no | no |
| A61. Edit other income | `IncomeSheet.tsx` | `PATCH /api/income` | write | medium | no | yes |
| A62. Delete other income | `IncomeSheet.tsx` | `DELETE /api/income` | write | high | yes | yes |
| A63. Open the summary | `src/components/tabs/BooksView.tsx` | `/summary` | nav | low | no | n/a |
| A64. Open bank review | `src/components/bank/BankTrackingProvider.tsx` | local queue; `GET /api/plaid/transactions` | nav | low | no | n/a |
| A65. Review an expense: add, already, ignore or restore | `src/components/bank/ReviewCard.tsx`, `ReviewStack.tsx` | `POST /api/plaid/review` | write | high | no | no |
| A66. Review a deposit: record, match, classify, ignore or restore | `src/components/bank/DepositCard.tsx` | `POST /api/plaid/deposits` | write | high | no | yes |
| A67. Connect a bank | `src/components/bank/BankAccountsScreen.tsx`, `PlaidConnect.tsx` | `POST /api/plaid/link-token`, `POST /api/plaid/exchange` | write | high | yes | no |
| A68. Track or untrack accounts | `BankAccountsScreen.tsx` | `POST /api/plaid/accounts` | write | medium | no | no |
| A69. Set the digest time | `BankAccountsScreen.tsx` | local state only | write | low | no | n/a |
| A70. Disconnect a bank | `BankAccountsScreen.tsx` | `POST /api/plaid/disconnect` | write | high | yes | no |
| A71. Reconnect or sync | `BankAccountsScreen.tsx` | `GET /api/plaid/accounts` polling and `/api/plaid/sync` | read | medium | no | n/a |
| A72. Attach a receipt in bank review | `ReviewCard.tsx` | upload through `src/lib/bank-receipt.ts`; hash sent to the review route | write | medium | no | no |

### A5. Settings

| action | component file | route, RPC or table it hits | type | risk | confirm step today | idempotent today |
|---|---|---|---|---|---|---|
| A73. Navigate a settings row | `src/app/(app)/settings/SettingsView.tsx` | `router.push` | nav | low | no | n/a |
| A74. Edit business info | `SettingsView.tsx` | `profiles.update` | write | low | no | yes |
| A75. Edit brand design or logo | `SettingsView.tsx` | storage upload and `profiles.update` | write | medium | no | no |
| A76. Save or remove Zelle | `SettingsView.tsx` | `GET` or `POST /api/zelle` | write | medium | no | yes |
| A77. Save or remove another payout method | `src/app/(app)/settings/payouts/PayoutsScreens.tsx` | table writes; exact table not re-verified in this audit | write | medium | no | unverified |
| A78. Upgrade the plan | `SettingsView.tsx` | `POST /api/checkout` | send | medium | yes | unverified |
| A79. Manage billing | `SettingsView.tsx` | `POST /api/billing-portal` | send | low | no | n/a |
| A80. Cancel, resume or accept a retention offer | `src/app/(app)/settings/plan/cancel/CancelScreen.tsx` | `/api/subscription/cancel`, `/api/subscription/resume`, `/api/subscription/offer` | write | high | yes | unverified |
| A81. Toggle notifications or send a test push | `SettingsView.tsx` | `POST /api/push/subscribe`, `POST /api/push/test` | write | low | no | yes |
| A82. Invite or copy a referral link | `SettingsView.tsx` | local clipboard; `profiles` read | read | low | no | n/a |
| A83. Send feedback | feedback screen | `POST /api/feedback` | send | low | no | no |
| A84. Sign out | `SettingsView.tsx` | `supabase.auth.signOut` | write | low | no | n/a |
| A85. Delete the account | `SettingsView.tsx` | `POST /api/delete-account` | write | high | yes | no |

A rows: 85.

## B. Chat actions

### B1. Router intents

| action | component file | route, RPC or table it hits | type | risk | confirm step today | idempotent today |
|---|---|---|---|---|---|---|
| B1. Ask a question about unpaid invoices | `src/app/api/route/route.ts`, `src/app/api/ask/route.ts` | `unpaid_invoices` read tool | read | medium | no | n/a |
| B2. Build or edit a document, or answer a clarification | `src/app/api/route/route.ts`, `src/app/api/parse/route.ts` | `/api/parse` | write | high | no | no |
| B3. Ask an unsupported account question | `src/lib/tools/reply.ts` | canned `UNSUPPORTED_REPLY`; no lookup | read | low | no | n/a |

The router enum is exactly `ask`, `build` and `unsupported` (`src/lib/router/classify.ts`). A `bypass` or a message containing a digit or `$` goes straight to build without the router (`src/lib/router/decide.ts`).

### B2. Routes chat calls

| action | component file | route, RPC or table it hits | type | risk | confirm step today | idempotent today |
|---|---|---|---|---|---|---|
| B4. Classify a turn | `ChatView.tsx`, `src/lib/router/route-client.ts` | `POST /api/route` | read | medium | no | n/a |
| B5. Parse a build turn | `ChatView.tsx` | `POST /api/parse` | write | high | no | no |
| B6. Answer an ask turn | `ChatView.tsx`, `src/lib/ask-client.ts` | `POST /api/ask` | read | medium | no | n/a |
| B7. Transcribe a voice turn | `ChatView.tsx` | `POST /api/transcribe` | read | medium | no | n/a |
| B8. Read a receipt photo | `ChatView.tsx` | `POST /api/parse-receipt` | read | medium | no | n/a |
| B9. Check plan access and limits | `ChatView.tsx` | `GET /api/access` | read | low | no | n/a |
| B10. Load the Zelle payout handle | `ChatView.tsx` | `GET /api/zelle?full=1` | read | high | no | n/a |
| B11. Mark an invoice sent | `ChatView.tsx` | `POST /api/invoices/[id]/send` | send | high | yes | no |
| B12. Mark an estimate sent | `ChatView.tsx` through `src/lib/estimates/owner-actions.ts` | `POST /api/estimates/[id]/send` | send | high | yes | no |
| B13. Subscribe to push | `ChatView.tsx` through `src/lib/push.ts` | `POST /api/push/subscribe` | write | medium | no | yes |
| B14. Open subscription checkout | `src/components/PaywallModal.tsx` | `POST /api/checkout` | send | medium | yes | unverified |

### B3. In-chat cards

| action | component file | route, RPC or table it hits | type | risk | confirm step today | idempotent today |
|---|---|---|---|---|---|---|
| B15. "What I can do" command card | `src/components/chat/CommandCard.tsx` | local `COMMAND_GROUPS`; no route | nav | low | no | n/a |
| B16. Event card from the event feed | `src/components/chat/EventCard.tsx` | `events` read; opens an invoice | nav | low | no | n/a |
| B17. Invoice or estimate record card | `src/components/chat/LedgerCard.tsx` | local draft; writes on Send | write | high | yes on Send | no |
| B18. Sent-estimate card | `src/components/chat/ReadyEstimateCard.tsx` | `invoices` read for token and validity | read | low | no | n/a |
| B19. Payment confirmation and undo card | `src/components/chat/PaymentCard.tsx` | `invoice_payments` insert or update | write | high | yes | yes |
| B20. Payment proposal and picker card | `src/components/chat/PaymentProposalCard.tsx` | `client_summaries` and `invoices` read, then `invoice_payments` insert | write | high | yes | yes |
| B21. Expense draft card | `src/components/ExpenseCard.tsx` | local draft; `expenses` insert on Save | write | medium | no | no |
| B22. Logged-expense confirmation card | `src/components/LoggedExpenseCard.tsx` | local confirmation; no route | read | low | no | n/a |
| B23. Recap card | `src/components/chat/RecapChatCard.tsx` | local recap model from table reads | read | low | no | n/a |
| B24. Nudge card | `src/components/ChatNudgeCard.tsx` | local call to action | read | low | no | n/a |
| B25. Save prompt card | `src/components/SavePromptCard.tsx` | `save_client` RPC, `products` update, `recurring_expenses` insert | write | medium | no | partial |
| B26. Guided invoice or estimate template card | `src/components/template/TemplateCard.tsx` | local draft; `invoices` soft delete on discard | write | medium | yes on discard with content | no |
| B27. Sign-in gate card | `src/components/chat/SignInChatButton.tsx` | `/login` | nav | low | no | n/a |
| B28. Paywall gate | `src/components/PaywallModal.tsx` | `/api/access`, `/api/checkout` | nav | medium | yes | unverified |

### B4. The "?" command list

| action | component file | route, RPC or table it hits | type | risk | confirm step today | idempotent today |
|---|---|---|---|---|---|---|
| B29. Open "What I can do" | `ChatView.tsx`, `CommandCard.tsx` | local `COMMAND_GROUPS` | read | low | no | n/a |

The card has six visible rows in four groups:

- Create: New estimate ("Estimate for Ruth, deck repair, $800"); New invoice ("Invoice Maryam $150 for the door install").
- Money: Record a payment (a button, not a phrase).
- Clients: Add a client ("Add Joe Ortiz, 945-555-0134").
- Recaps: Daily recap ("How did today go?"); Weekly recap ("How'd I do this week?").

Three rows from the design are deliberately hidden because no working path exists: Send a reminder, Who owes me, and Look up a client. The source comments at `src/lib/chat-commands.ts` say so. Typing a "who owes me" question still reaches the router and can be answered by the ask path.

B rows: 29.

## C. Tool mapping

Status counts: 11 reuse, 38 needs new handler, 4 backend missing. Total 53.

### C1. Read tools

| proposed tool | status | why |
|---|---|---|
| C1. who_owes_me | reuse `unpaid_invoices` via `/api/ask` | The only tool in `src/lib/tools/registry.ts`; read-only and already returns unpaid balances. |
| C2. list_invoices | needs new handler | The `invoices` table and RLS exist; there is no owner-facing GET route and no list handler. |
| C3. get_invoice | needs new handler | No GET-by-id route; only direct table reads in components. |
| C4. list_estimates | needs new handler | Estimates are rows in `invoices`; no list handler exists. |
| C5. get_estimate | needs new handler | `/api/public/estimates/[token]` is public-token scoped, not owner-id scoped. |
| C6. find_client | needs new handler | `clients` and the `client_summaries` RPC exist; no fuzzy-find handler exists. |
| C7. get_client_summary | needs new handler | `client_summaries` exists, but no route wraps it for a tool. |
| C8. list_expenses | needs new handler | `expenses` exists; no list route. |
| C9. get_expense | needs new handler | No GET-by-id route. |
| C10. list_payments | needs new handler | `invoice_payments` exists; no list route. |
| C11. list_saved_items | needs new handler | `products` exists; no list route. |
| C12. run_report | needs new handler | No report endpoint; totals are computed in pages and components. |
| C13. get_recap | needs new handler | `src/components/chat/recap-load.ts` and `src/lib/chat-recap.ts` exist, but they are client-side helpers, not a server tool. |
| C14. get_account_status | needs new handler | `/api/access` covers plan access only; bank connection status has no combined status route. |
| C15. search_past_jobs | needs new handler | No search endpoint or index; only table reads. |
| C16. make_summary_pdf | needs new handler | No summary PDF route was found; whether a reusable builder exists is unverified. |
| C17. get_invoice_pdf | needs new handler | Invoice PDFs are built client-side; there is no server PDF route. |

### C2. Plaid read tools

| proposed tool | status | why |
|---|---|---|
| C18. list_bank_activity | reuse `GET /api/plaid/transactions` | Route exists and returns review rows; preview-gated by `plaidRouteEnabled`. |
| C19. get_unaccounted_totals | needs new handler | No route returns totals; the UI derives unaccounted counts from the review queue. |
| C20. list_connected_banks | reuse `GET /api/plaid/accounts` | Route exists and is read through `BankAccountsScreen`. |

### C3. Write tools

| proposed tool | status | why |
|---|---|---|
| C21. create_invoice | needs new handler | Finalize is a client-side insert in `ChatView`; no server create route. |
| C22. create_estimate | needs new handler | Same client-side insert path; kind is pinned by the document row. |
| C23. edit_line_items | needs new handler | Draft edits are local; sent-estimate edits use `/api/estimates/[id]/edits` only. |
| C24. edit_document_details | needs new handler | Notes, due date and deposit are direct `invoices` updates in the detail screen. |
| C25. convert_estimate_to_invoice | needs new handler | `src/lib/estimates/convert-client.ts` is a client helper; no route. |
| C26. mark_estimate_signed | needs new handler | A token-scoped sign route exists, but no owner-authenticated tool wrapper. |
| C27. mark_invoice_sent | reuse `POST /api/invoices/[id]/send` | The route owns the status transition and the send snapshot. |
| C28. delete_draft | needs new handler | Soft delete is a direct `invoices.deleted_at` update in the UI. |
| C29. add_attachment | needs new handler | Estimate presign/confirm routes exist; invoice attachments are client-side storage and `vault_documents` writes. |
| C30. record_payment | needs new handler | `recordPaymentOnce` is a client ledger helper; no payment route. |
| C31. record_unattached_payment | needs new handler | No route or helper for an unapplied payment. |
| C32. delete_payment | needs new handler | Direct `invoice_payments` update or delete. |
| C33. add_expense | needs new handler | `expenses` insert in `AddExpenseSheet` and `ChatView`; no route. |
| C34. edit_expense | needs new handler | No expense edit route; UI only inserts and soft-deletes. |
| C35. delete_expense | needs new handler | Soft delete is a direct `expenses` update. |
| C36. create_client | reuse `save_client` RPC | The RPC already upserts on the case-insensitive name; a tool still needs a thin handler. |
| C37. edit_client | needs new handler | Direct `clients.update`. |
| C38. save_item | needs new handler | `products` upsert on `name_key` is client-side. |
| C39. add_recurring_expense | needs new handler | Direct `recurring_expenses` insert. |
| C40. stop_recurring_expense | needs new handler | Direct `recurring_expenses.deleted_at` update. |

### C4. Plaid write tools

| proposed tool | status | why |
|---|---|---|
| C41. review_bank_transaction | reuse `POST /api/plaid/review` | Route handles add, already, ignore and restore for expense rows. |
| C42. match_deposit_to_invoice | reuse `POST /api/plaid/deposits` | Route records a deposit against an invoice and owns `bank:<deposit id>` idempotency. |
| C43. classify_other_income | reuse `POST /api/plaid/deposits` | The `classified` action writes the income classification. |

### C5. Send tools

| proposed tool | status | why |
|---|---|---|
| C44. send_invoice | backend missing | `/api/invoices/[id]/send` only marks sent and snapshots; delivery is the browser Web Share. No server email or SMS sender exists. |
| C45. send_estimate | backend missing | Same gap: the route marks sent, but the client shares the link. |
| C46. send_payment_reminder | backend missing | `/api/followups` is an authenticated cron push, not an on-demand reminder route. |
| C47. draft_client_message | backend missing | No message drafting or delivery endpoint exists. |

### C6. Nav tools

| proposed tool | status | why |
|---|---|---|
| C48. open_screen | needs new handler | Navigation is client-only `router.push`; a model tool needs a validated screen map and a client executor. |
| C49. open_record | needs new handler | Deep links are built in components; there is no validated record resolver. |

### C7. Meta tools

| proposed tool | status | why |
|---|---|---|
| C50. app_help | reuse `COMMAND_GROUPS` | The help content is one constant in `src/lib/chat-commands.ts`; a tool needs only a read wrapper. |
| C51. cant_do | reuse `UNSUPPORTED_REPLY` | `src/lib/tools/reply.ts` already owns the exact copy. |
| C52. open_feedback | needs new handler | A feedback screen and `POST /api/feedback` exist, but no tool can open or prefill the screen. |
| C53. list_commands | reuse `COMMAND_GROUPS` | Same constant; no new data source. |

### C8. UI or chat actions with no tool coverage

- Every send action in A and B lacks a real delivery tool. C44 and C45 are marked backend missing because the routes stop at the status transition.
- The entire bank review surface has no chat tool. C41 and C42 cover the writes, but there is no tool that opens the review queue or explains a specific pending card.
- The invoice-detail edit actions (due date, notes, private notes, deposit, attachments) have no read or write tool. A22, A30 to A34 are uncovered.
- The estimate lifecycle actions (preview, copy link, extend, revoke) have no tool. A36 to A39 are uncovered except for the generic send path.
- Client detail (call, email, notes) and product duplicate are uncovered. A47, A48 and A51 have no tool.
- Settings actions have no tool coverage at all: business profile, brand, payout methods, plan, notifications, sign-out and account deletion.
- The recurring expense surface has no read tool; only proposed write tools C39 and C40 exist.
- "Who owes me" is the only read question with a shipped tool. Every other read question in C1 and C2 is uncovered today.

## D. Plaid status

The six Plaid tools are C18 to C20 (read) and C41 to C43 (write).

| tool | buildable on sandbox today | blocker or caveat |
|---|---|---|
| D1. list_bank_activity | yes, if sandbox credentials and the preview gate are set | `GET /api/plaid/transactions` exists. `plaidRouteEnabled` is preview-only. The repo does not contain the Plaid keys, so an end-to-end sandbox run is unverified. |
| D2. get_unaccounted_totals | handler needed | The data exists in `bank_transactions` and the review queue, but no route returns aggregate totals. Buildable once a handler is added. |
| D3. list_connected_banks | yes, if sandbox credentials and the preview gate are set | `GET /api/plaid/accounts` exists. Same credential and gate caveat. |
| D4. review_bank_transaction | yes, if sandbox credentials and the preview gate are set | `POST /api/plaid/review` exists and writes `expenses`. The route is reachable from the review stack. |
| D5. match_deposit_to_invoice | yes, if sandbox credentials and the preview gate are set | `POST /api/plaid/deposits` and the `bank_deposits` migration exist on main. The route owns `bank:<deposit id>`. |
| D6. classify_other_income | yes, if sandbox credentials and the preview gate are set | Same deposits route; the `classified` action writes `other_income`. |

None of the six waits on a missing Money In backend. On main, the Money In storage and route already exist: `supabase/migrations/20261102190000_bank_deposits.sql` and `src/app/api/plaid/deposits/route.ts`. All six are still gated by `plaidRouteEnabled` and require Plaid sandbox credentials. The review UI's unaccounted count is client-derived; that is the only part that needs a new read handler.

## E. Template inventory

### E1. In-chat cards

| component | file path | archetype | status |
|---|---|---|---|
| CommandCard | `src/components/chat/CommandCard.tsx` | nav link card | partial |
| EventCard | `src/components/chat/EventCard.tsx` | event/success card | covered |
| LedgerCard | `src/components/chat/LedgerCard.tsx` | record card | covered |
| ReadyEstimateCard | `src/components/chat/ReadyEstimateCard.tsx` | record card | covered |
| PaymentCard | `src/components/chat/PaymentCard.tsx` | event/success card | covered |
| PaymentProposalCard | `src/components/chat/PaymentProposalCard.tsx` | disambiguation picker | covered |
| ExpenseCard | `src/components/ExpenseCard.tsx` | small form card | covered |
| LoggedExpenseCard | `src/components/LoggedExpenseCard.tsx` | event/success card | covered |
| RecapChatCard | `src/components/chat/RecapChatCard.tsx` | recap card | covered |
| ChatNudgeCard | `src/components/ChatNudgeCard.tsx` | alert | covered |
| SavePromptCard | `src/components/SavePromptCard.tsx` | small form card | covered |
| TemplateCard | `src/components/template/TemplateCard.tsx` | record card | covered |
| SignInChatButton | `src/components/chat/SignInChatButton.tsx` | gate | covered |
| PaywallModal | `src/components/PaywallModal.tsx` | gate | covered |
| ReceiptBubble | `src/components/ReceiptBubble.tsx` | receipt card | covered |
| AssistantLine / OnItSpinner | `src/components/chat/EventCard.tsx`, `src/components/OnItSpinner.tsx` | thinking status line | covered |

### E2. Popup components

| component | file path | archetype | status |
|---|---|---|---|
| PopSheet | `src/components/popups/PopSheet.tsx` | confirm/diff card | covered |
| PopInline | `src/components/popups/PopInline.tsx` | confirm/diff card | covered |
| PopToast | `src/components/popups/PopToast.tsx` | event/success card | covered |
| RecordPaymentSheet | `src/components/invoice-detail/RecordPaymentSheet.tsx` | small form card | covered |
| PdfChoiceSheet | `src/components/PdfChoiceSheet.tsx` | disambiguation picker | covered |
| AddExpenseSheet | `src/components/AddExpenseSheet.tsx` | small form card | covered |
| IncomeSheet | `src/components/income/IncomeSheet.tsx` | small form card | covered |
| BankSheet | `src/components/bank/BankSheet.tsx` | confirm/diff card | covered |
| PickerSheet | `src/components/template/PickerSheet.tsx` | disambiguation picker | covered |
| KeypadSheet | `src/components/template/KeypadSheet.tsx` | small form card | covered |
| TaxSheet | `src/components/template/TaxSheet.tsx` | small form card | covered |
| ExtraInfoSheet | `src/components/template/ExtraInfoSheet.tsx` | small form card | covered |
| SignSheet | `src/components/estimate/SignSheet.tsx` | confirm/diff card | covered |
| SuccessSheet | `src/components/estimate/SuccessSheet.tsx` | event/success card | covered |
| AuthSheet | `src/components/auth/AuthSheet.tsx` | gate | covered |
| ReviewCard | `src/components/bank/ReviewCard.tsx` | bank review card | covered |
| DepositCard | `src/components/bank/DepositCard.tsx` | bank review card | covered |
| Feedback prompt (inline) | `src/components/tabs/ChatView.tsx` | feedback prompt | covered |

### E3. Archetype coverage

| archetype | status | note |
|---|---|---|
| record card | covered | LedgerCard, ReadyEstimateCard and TemplateCard. |
| ranked list | partial | The unpaid tool returns ranked rows, but there is no general ranked-list chat card. |
| stat tile | partial | Books and recap surfaces show totals; chat has no standalone stat tile. |
| trend chart | gap | No trend chart component or chat chart was found. |
| breakdown chart | gap | No breakdown chart component was found. |
| confirm/diff card | covered | PaymentProposalCard, PopSheet, PopInline, BankSheet, SignSheet. |
| draft message with Send | partial | LedgerCard previews and sends a document; there is no editable client-message draft. |
| disambiguation picker | covered | PaymentProposalCard picker, PdfChoiceSheet, PickerSheet. |
| event/success card | covered | EventCard, PaymentCard, LoggedExpenseCard, PopToast, SuccessSheet. |
| recap card | covered | RecapChatCard. |
| small form card | covered | ExpenseCard, RecordPaymentSheet, AddExpenseSheet, IncomeSheet and template sheets. |
| bank review card | covered | ReviewCard and DepositCard. |
| receipt card | covered | ReceiptBubble and ExpenseCard. |
| alert | covered | ChatNudgeCard and toast surfaces. |
| gate (sign-in / upgrade) | covered | SignInChatButton, AuthSheet, PaywallModal. |
| can't-do card | partial | The unsupported path is reply text; there is no dedicated card. |
| nav link card | partial | EventCard and owner cards link out; there is no generic nav-link card. |
| feedback prompt | covered | Inline feedback prompt, plus the settings feedback screen. |
| thinking status line | covered | AssistantLine and OnItSpinner. |

Archetype counts: 12 covered, 5 partial, 2 gap. The two gaps are trend chart and breakdown chart.

### E4. ConfirmSheet versus the Pop family

- `ConfirmSheet`: 0 references in `src` (0 files, excluding tests). The component does not exist in this tree.
- `PopSheet`: 9 files with at least one reference, excluding tests.
- `PopInline`: 3 files.
- `PopToast`: 6 files.

The Pop family should be the single standard: `PopSheet` for a blocking confirm or small form, `PopInline` for an inline decision, and `PopToast` for a result. `ConfirmSheet` costs nothing to migrate because it is absent; there is no call site to replace. The real competing confirm pattern is `DeleteConfirmModal` plus `lib/confirm-guard`, not `ConfirmSheet`. Migrating those call sites to `PopSheet` is a separate change; their exact usage count was not measured in this audit (unverified).

## F. Risks

### F1. Service-role client reachable from a chat path

The service-role client is `adminClient()` in `src/lib/supabase/admin.ts`. It bypasses RLS. The following routes are reachable from a chat-originated flow and use it:

- `POST /api/zelle` and `GET /api/zelle`: import at `src/app/api/zelle/route.ts:9`, calls at lines 32 and 68. Chat reads it at `src/components/tabs/ChatView.tsx:2655`. The route takes the user from the session and calls `get_zelle` / `set_zelle` with that user id, but the query itself runs with the service role.
- `POST /api/invoices/[id]/send`: import at `src/app/api/invoices/[id]/send/route.ts:10`, call at line 35. Chat calls it at `ChatView.tsx:2780` and `ChatView.tsx:3621`.
- `POST /api/estimates/[id]/send`: import at `src/app/api/estimates/[id]/send/route.ts:9`, call at line 37. Chat calls it through `src/lib/estimates/owner-actions.ts:54`, imported by `ChatView.tsx:24`.
- `POST /api/push/subscribe`: import at `src/app/api/push/subscribe/route.ts:15`, calls at lines 46 and 74. Chat subscribes through `src/lib/push.ts`, imported by `ChatView.tsx:37`.
- `POST /api/feedback`: import at `src/app/api/feedback/route.ts:11`, insert at line 35. The chat feedback prompt leads to the feedback screen, which posts here.
- Adjacent, not chat-originated: `src/app/api/income/route.ts` uses `adminClient()` at lines 17, 84, 105 and 148; `src/lib/events-server.ts` uses it at line 44 for public document-view event writes. Both are worth reviewing in the same access-control pass.

All of these routes authenticate first and scope their reads and writes by the session user id. The risk is blast radius: any ownership-check mistake in a service-role route is not contained by RLS. It is not evidence of an auth bypass in this audit.

### F2. Model-written text that can contain a dollar figure

- `src/app/api/parse/route.ts:191` returns the model's `result.reply` immediately for `intent === 'record_payment'`. That early return happens before the money narration and sentence stripping at lines 520 to 536. If the model puts a dollar amount in that reply, no server guard runs on this path.
- The normal build path is guarded: `guardReplyFigures` runs, then any sentence matching `/\$\s?\d/` is dropped at `src/app/api/parse/route.ts:520` to `536`. The server composes the money sentence itself.
- The ask path is guarded: `src/app/api/ask/route.ts:188` calls `replyFor`, and `src/lib/tools/reply.ts:22` to `25` drops any sentence with a dollar amount.
- The router is enum-only and cannot write prose (`src/lib/router/classify.ts`).
- `parse-receipt` returns numeric fields and cards format the amount; no model prose money is rendered by that route.

The record-payment early return is the one confirmed place where model prose reaches the client without the standard money strip.

### F3. Model-call cap per turn

`MAX_MODEL_CALLS = 3` is set at `src/lib/tools/registry.ts:11`. That cap applies to the `/api/ask` loop only. It is not a cap on the whole chat turn.

- The router adds one `/api/route` model call with a 2000 ms ceiling (`ROUTER_TIMEOUT_MS` at `src/lib/router/classify.ts:13`).
- A build turn then spends one model call in `/api/parse`.
- An ask turn can spend up to three model calls in `/api/ask`.
- A receipt turn can add one `/api/parse-receipt` call.

Worst case is four model calls in one turn: one router plus three ask calls. A build turn is normally two: router plus parse. The router is skipped entirely on a bypass (image, open clarification, voice follow-up) or when the text contains a digit or `$` (`src/lib/router/decide.ts`).

### F4. AI-related environment flags and Supabase project mapping

AI and AI-adjacent flags found in the tree:

- `NEXT_PUBLIC_AI_TOOLS`: `src/lib/feature-flags.ts:24`. Build-time public flag.
- `aiToolsForEnv(VERCEL_ENV)`: `src/lib/feature-flags.ts:32`. Server-side preview-only gate; production, local development and an unset value are off.
- `ANTHROPIC_API_KEY`: `src/lib/ai.ts:146`; also used by the router call.
- `ANTHROPIC_MODEL`: `src/lib/ai.ts:8`; defaults to `claude-haiku-4-5-20251001`.
- `ASSEMBLYAI_API_KEY`: read by the transcribe route. The exact line was not re-opened in this audit (unverified).
- `NEXT_PUBLIC_TRACE`: `src/lib/trace.ts:10`.
- `NEXT_PUBLIC_TRACE_VERBOSE`: `src/lib/trace.ts:16`.
- `NEXT_PUBLIC_RECAPS_LIVE`: `src/lib/recaps-live.ts:10`. Recap feature flag, not a model flag.
- `NEXT_PUBLIC_IN_APP_CAMERA`: `src/lib/feature-flags.ts:15`. Camera flag, not a model flag.
- `NEXT_PUBLIC_PAYWALL_ENABLED`: `src/lib/paywall.ts:6`. Access flag, not a model flag.
- `bankTrackingForEnv(VERCEL_ENV)`: `src/lib/feature-flags.ts:40`. Preview-only bank flag, not a model flag.

Supabase project mapping:

- Repository documentation and `.env.example` name the production project `bitfmmffnigxjjyxoxfr`.
- Estimate-feature documentation names a test ref `aiijzulctfpzdfjqyggm`.
- The actual values in Vercel Production and Preview could not be read from this repository. Which project each environment points at is unverified. `CLAUDE.md` says preview and production share a database, but the deployed environment values still need a Vercel dashboard check.

### F5. Chat tables in migrations

`chat_messages`, `chat_feedback` and `help_gaps` do not exist in any migration or in `src`. A repository-wide search returned zero matches.

What does exist:

- `feedback` table: `supabase/migrations/20261017000000_feedback.sql`.
- `events` table: `supabase/migrations/20261108120000_alive_events.sql`.
- Event dedupe index: `events_user_dedupe_uidx` at `20261108120000_alive_events.sql:114`.
- Push notification dedupe: `supabase/migrations/20260929000000_push_notifications.sql:65`.

Chat history is stored in localStorage, not in a database table. Feedback is a separate table, not chat feedback.

### F6. Idempotency keys and writes that lack one

Keys that exist:

- Invoice finalize: `finalize_key = convoId`. `ChatView.tsx:2433` writes it; the unique index is `invoices_user_finalize_key_idx` in `supabase/migrations/20260827024826_invoice_finalize_idempotency_key.sql:42`.
- Invoice payment: `invoice_payments.idempotency_key`. `InvoiceDetailScreen.tsx:549` and `:646`, and `ChatView.tsx:5201`. Unique index in `supabase/migrations/20261029041303_invoice_payments_idempotency_key.sql`.
- Bank deposit payment: `bank:<deposit id>`. `src/lib/plaid/deposit-ledger.ts:41`; the deposits route looks it up at `src/app/api/plaid/deposits/route.ts:458`.
- Estimate conversion: `convert-<estimate id>`. `src/lib/estimates/convert-client.ts:27`; `EstimateDetail.tsx:367` writes it as the invoice `finalize_key`.
- Event dedupe: `dedupe_key` with the partial unique index at `20261108120000_alive_events.sql:114`.
- Push notification dedupe: `notification_log.dedupe_key` at `20260929000000_push_notifications.sql:65`.
- Stripe checkout: a key is built by the checkout flow, but the exact format and line were not re-verified in this audit (unverified).

Writes with no request-level idempotency key:

- Expense insert: `src/components/AddExpenseSheet.tsx:105` and `src/components/tabs/ChatView.tsx:3261`.
- Client create: `save_client` RPC at `src/components/clients/ClientForm.tsx:101`. The RPC upserts on name, but that is a business key, not a retry key.
- Product insert or upsert: `src/components/clients/ProductForm.tsx:99` and `:100`.
- Recurring insert and update: `src/components/recurring/RecurringForm.tsx:95` and `:96`.
- Invoice send status transition: `src/app/api/invoices/[id]/send/route.ts:84`.
- Estimate send status transition: `src/app/api/estimates/[id]/send/route.ts:101`.
- Estimate extend: `src/app/api/estimates/[id]/extend/route.ts:45`.
- Estimate revoke: `src/app/api/estimates/[id]/revoke/route.ts:33`.
- Estimate edit: `src/app/api/estimates/[id]/edits/route.ts:99`.
- Invoice attachment insert: `src/components/invoice-detail/InvoiceDetailScreen.tsx:839`.
- Estimate attachment confirm: presign and confirm routes under `src/app/api/estimates/[id]/attachments/` have no client-supplied key.

## G. Open questions

1. Which Supabase project do Vercel Production and Preview actually use? The repository names `bitfmmffnigxjjyxoxfr` for production and `aiijzulctfpzdfjqyggm` in estimate documentation, but the deployed values are unverified.
2. Should `/api/ask` and the router ship beyond preview? Both the public flag and the preview-only server gate currently keep production off.
3. Should `send_invoice` and `send_estimate` actually deliver email or SMS, or is "mark sent plus a share link" the intended product behavior? No server delivery path exists today.
4. Should chat write tools create their own server-side draft, or mutate the live client draft that `ChatView` owns? The current writes are client-side and keyed to the conversation.
5. Is `ConfirmSheet` a planned component or a stale name? It has zero references in the tree.
6. Should bank review and Money In be enabled in production? The backend exists on main, but the feature flag is preview-only and part of the UI still has fixture-only states.
7. What is the source of truth for unaccounted totals? The review queue derives them on the client, and no route returns an aggregate.
8. What per-turn model budget is acceptable? The current worst case is four calls: one router plus three ask calls.
9. Should chat messages, chat feedback and help gaps become database tables, or are localStorage plus the existing `feedback` and `events` tables sufficient?
10. For `get_account_status`, does the tool mean subscription access, bank connection status, or both? The current routes split those concerns.
