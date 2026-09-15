# Code Audit Review — On It

This audit covers real bugs identified across the codebase, focused on financial calculations, authentication & data isolation, status consistency, error handling, and date/timezone handling. Findings are ranked by severity.

---

## 1. Critical Severity

### Finding 1: Direct Status Update Regresses Fully Paid Invoices
- **File path and line number(s)**: `src/app/(app)/invoices/[id]/page.tsx:264-266`
- **Focus area**: Status consistency
- **What happens, concrete example, and why it's wrong**: When `resend()` is called on an invoice (e.g. clicking "Resend" or "Send balance request"), it executes `supabase.from('invoices').update({ status: 'sent', sent_at: ... })`. If an invoice is already fully paid (`amount_paid >= total`, `status = 'paid'`), this query forcibly overwrites `invoices.status` from `'paid'` back to `'sent'` in the database. The database trigger `reconcile_invoice_from_ledger` only recalculates invoice status when rows in `invoice_payments` are inserted/updated/deleted. Direct updates to `invoices.status` bypass ledger reconciliation, leaving fully paid invoices permanently stuck in `'sent'` status despite payments remaining intact in the ledger.
- **Severity**: Critical
- **Confidence**: Verified by reading the code
- **Suggested fix**: In `resend()`, omit `status: 'sent'` from the update payload if `inv.status === 'paid'`. Only update `sent_at` and the render snapshot.

---

## 2. High Severity

### Finding 2: Dashboard Metrics Ignore Deposits and Partial Payments
- **File path and line number(s)**: `src/app/(app)/dashboard/page.tsx:40-46`
- **Focus area**: Money
- **What happens, concrete example, and why it's wrong**: `loadStats()` computes collected revenue as `filter(status === 'paid').reduce((s, i) => s + Number(i.total), 0)` and outstanding balance as `filter(['sent', 'overdue'].includes(status)).reduce((s, i) => s + Number(i.total), 0)`. If an invoice has `total = 1000` and a $400 deposit is collected (`amount_paid = 400`, `status = 'sent'`), Dashboard reports `outstanding = 1000` (instead of $600) and `paid = 0` (instead of $400). It ignores `amount_paid` entirely, misrepresenting both collected earnings and outstanding amounts whenever deposits or partial payments exist.
- **Severity**: High
- **Confidence**: Verified by reading the code
- **Suggested fix**: In `dashboard/page.tsx`, sum `Number(i.amount_paid ?? 0)` for collected revenue across non-draft invoices, and sum `Math.max(0, Number(i.total) - Number(i.amount_paid ?? 0))` for outstanding sent/overdue balances.

### Finding 3: Tax Summary / Books Income Calculations Ignore Payments Ledger and Deposits
- **File path and line number(s)**: `src/lib/tax-summary.ts:163-176` and `src/app/(app)/summary/page.tsx:70-76`
- **Focus area**: Money
- **What happens, concrete example, and why it's wrong**: `summarizeIncome()` calculates `broughtIn` by adding `Number(inv.total)` for `paid` invoices, and `stillOwed` by adding `Number(inv.total)` for `sent`/`overdue` invoices. The Supabase query in `summary/page.tsx` does not select `amount_paid`. For an invoice with total $1,000 and a $400 deposit paid (`status = 'sent'`, `amount_paid = 400`), `summarizeIncome()` reports `stillOwed = 1000` (instead of $600) and `broughtIn = 0` (instead of $400). On a cash-basis tax summary, collected deposits are omitted from brought-in revenue and over-reported in still-owed balances.
- **Severity**: High
- **Confidence**: Verified by reading the code
- **Suggested fix**: Select `amount_paid` in `summary/page.tsx`, and update `summarizeIncome()` in `src/lib/tax-summary.ts` to sum `amount_paid` for brought-in income and `total - amount_paid` for still-owed balances.

### Finding 4: Inline Unrounded Financial Math Diverges from `financials.ts` Engine
- **File path and line number(s)**: `src/app/(app)/chat/page.tsx:690-694, 717`
- **Focus area**: Money
- **What happens, concrete example, and why it's wrong**: In `buildRenderData()`, `subtotal`, `taxAmount`, and `total` are re-calculated inline via `items.reduce(...)` and `Math.round(subtotal * taxRate) / 100` without line-item rounding or using `calculateSubtotal` / `calculateTaxAmount`. `calculateInvoiceTotals` is called on line 703 to compute `totals` (which rounds per line item), but `buildRenderData` returns the inline unrounded figures in `InvoiceRenderData`. For line items `[{ qty: 3, unit_price: 33.333 }]` and `tax_rate = 8.25`: `financials.ts` computes `subtotal = 100.00`, `taxAmount = 8.25`, `total = 108.25`, whereas `buildRenderData` returns `subtotal = 99.999`, `total = 108.249`. This violates the single-source-of-truth requirement in `src/lib/financials.ts`, introducing arithmetic drift and discrepancies between line items and totals on rendered documents.
- **Severity**: High
- **Confidence**: Verified by reading the code
- **Suggested fix**: In `buildRenderData()`, assign `subtotal`, `taxAmount`, and `total` directly from `totals.subtotal`, `totals.taxAmount`, and `totals.total` returned by `calculateInvoiceTotals(...)`.

---

## 3. Medium Severity

### Finding 5: `resend()` Lack of Exception Handling Strands UI in Busy State
- **File path and line number(s)**: `src/app/(app)/invoices/[id]/page.tsx:255-268`
- **Focus area**: Error handling
- **What happens, concrete example, and why it's wrong**: `resend()` sets `setBusy(true)` at the start of the action but does not wrap `elementToPdf`, `shareInvoice`, or the DB update in a `try...finally` block. If a user cancels the Web Share dialog, or if PDF canvas rendering throws an error, execution halts before `setBusy(false)` is reached. The component remains stuck in `busy === true`, leaving "Resend" and "Send balance request" buttons permanently disabled until the page is reloaded.
- **Severity**: Medium
- **Confidence**: Verified by reading the code
- **Suggested fix**: Wrap the execution body of `resend()` in a `try...finally` block, ensuring `setBusy(false)` is always called in the `finally` clause.

### Finding 6: Local Midnight ISO Conversion Shifts Payment Dates Across Timezones
- **File path and line number(s)**: `src/app/(app)/invoices/[id]/page.tsx:32-35, 209`
- **Focus area**: Timezone and date handling
- **What happens, concrete example, and why it's wrong**: `localDateToIso` converts a local date string (`"YYYY-MM-DD"`) from `<input type="date">` into an ISO timestamp via `new Date(y, m - 1, d).toISOString()`. When a user in Los Angeles (UTC-8) enters `"2026-09-18"`, `localDateToIso` produces `2026-09-18T07:00:00.000Z`. When this timestamp is fetched and formatted via `new Date(p.paid_at).toLocaleDateString()` on a browser in Hawaii (UTC-10) or UTC, it evaluates to September 17 (`2026-09-17`), shifting the recorded payment date back by one day.
- **Severity**: Medium
- **Confidence**: Verified by reading the code
- **Suggested fix**: Store payment dates as explicit UTC-centered ISO strings (e.g. `${ymd}T12:00:00.000Z`) or date-only strings so that date-only entries remain stable across timezones.

### Finding 7: Voice/Text Confirmation Summary Omits Tax in Announced Total
- **File path and line number(s)**: `src/app/(app)/chat/page.tsx:744`
- **Focus area**: Money
- **What happens, concrete example, and why it's wrong**: `confirmSummary()` in `chat/page.tsx` computes `total` as `items.reduce((s, li) => s + li.qty * li.unit_price, 0);`, omitting `tax_rate` and line-item rounding from `calculateInvoiceTotals`. For a draft invoice with a $100 line item and 10% tax (`tax_rate = 10`), `confirmSummary()` announces "Here's your invoice for Client: $100.00", whereas the actual invoice preview and final document total is $110.00.
- **Severity**: Medium
- **Confidence**: Verified by reading the code
- **Suggested fix**: Use `calculateInvoiceTotals(items, draft?.tax_rate ?? 0, ...).total` inside `confirmSummary()` to compute the announced total.

---

## 4. Low Severity

### Finding 8: PDF Document Renders Mismatched Issued and Due Date Formats
- **File path and line number(s)**: `src/app/(app)/invoices/[id]/page.tsx:128-150` and `src/lib/pdf/templates/index.tsx:324-325, 581-582, 636`
- **Focus area**: Timezone and date handling
- **What happens, concrete example, and why it's wrong**: In `InvoiceDetail`, `issuedDate` is passed as `new Date(inv.created_at).toLocaleDateString()` (producing `"9/18/2026"`), while `dueDate` is passed directly as `inv.due_date` (a DB date string formatted as `"2026-10-18"`). The PDF template renders `Issued: 9/18/2026` and `Due: 2026-10-18` (or `9/18/2026 · DUE 2026-10-18`), displaying mismatched date formats on the rendered document.
- **Severity**: Low
- **Confidence**: Verified by reading the code
- **Suggested fix**: Format both `issuedDate` and `dueDate` using `formatDate()` from `@/lib/dates` before constructing `InvoiceRenderData`.
