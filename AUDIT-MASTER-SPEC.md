# On It — Master Audit & Capability Assessment

## 1. Inventory of Existing Features

### Screens, Pages & Routes
- **`/chat` (`src/app/(app)/chat/page.tsx`)**: Conversational interface with mic recording (Web Speech API / transcription endpoint), text composer, chat storage (`chat-storage.ts`), draft state management, and embedded draft preview cards (`SavePromptCard`, `ExpenseCard`, `LoggedExpenseCard`).
- **`/invoices` & `/invoices/[id]` (`src/app/(app)/invoices/`)**: Document management for Invoices and Quotes. List filtering (all, unpaid, paid, quotes), invoice creation/editing, line item editing, deposit support, PDF preview & generation, delivery (email/SMS/link share), payment recording, and deletion.
- **`/expenses` (`src/app/(app)/expenses/page.tsx`)**: Expense tracking screen. Manual expense entry (`AddExpenseSheet`), receipt scanning (`parse-receipt`), photo upload with HEIC/image conversion, filtering by date and category, expense edit/deletion.
- **`/dashboard` & `/dashboard/recurring` (`src/app/(app)/dashboard/`)**: Overview dashboard showing books/totals, financial highlights, recent documents/expenses, and recurring invoices/expenses management.
- **`/clients` (`src/app/(app)/clients/`)**: Client directory with saved contact details (phone, email, address, notes), client creation/editing, and product/service catalog (`/clients/products`).
- **`/summary` (`src/app/(app)/summary/page.tsx`)**: Financial summary and tax reporting page displaying breakdown of revenue, expenses, net income, and tax estimates.
- **`/recaps` (`src/app/(app)/recaps/page.tsx`)**: Periodic financial performance recaps and visual stories with animated audio cards.
- **`/vault` (`src/app/(app)/vault/page.tsx`)**: Document & receipt storage vault.
- **`/settings` (`src/app/(app)/settings/`)**: Profile preferences, business branding, Stripe Connect onboarding, payment handle configuration (Zelle, Cash App, Venmo, PayPal), push notifications, subscription status, and account deletion.
- **`/pay/[token]` (`src/app/pay/[token]/page.tsx`)**: Public client payment portal for online invoice payment via Stripe Credit/Debit, Cash App, or manual mark-as-paid.

### Core Domain Capabilities
- **Invoicing & Quoting**: Sequential numbering, line item calculation with custom units (`hour`, `sq ft`, `job`), detail notes, tax calculation, deposit types (`percentage`, `fixed`, `none`), payment terms, PDF rendering (`jspdf` + `html2canvas`).
- **Expenses**: Categorized expense entries, receipt receipt-vision OCR extraction (`/api/parse-receipt`), recurring schedules.
- **Client & Product Catalog**: Automatic client deduplication/creation, saved products/services pricing catalog.
- **Payment Processing**: Stripe Connect integration, direct client-to-merchant payment, digital wallet links (Cash App, Venmo, PayPal, Zelle).
- **Recaps & Analytics**: Live calculation of totals, profit margins, tax liabilities, and month-over-month comparisons.

---

## 2. Current Conversational Intents & Tool Mapping

Currently, conversational understanding is handled via a single endpoint: **`POST /api/parse`** using `Claude Haiku 4.5` (`src/lib/ai.ts`).

### Current Intent Schema
The extraction system classifies input into:
1. `intent`: `'invoice' | 'quote' | 'expense' | 'question' | 'other'`
2. `intent_explicit`: Boolean indicating if document type was explicitly named in the current turn.
3. Extracted fields:
   - `client_name`, `client_address`, `client_phone`
   - `line_items`: Array of `{ description, qty, unit_price, unit, detail }`
   - `tax_rate` (percentage)
   - `due_date`
   - `notes`
   - `deposit_type` (`'percentage' | 'fixed' | 'none'`) and `deposit_value`
   - `expense`: `{ amount, category, vendor, occurred_on }`
   - `missing`: Array of required missing fields
   - `reply`: Server-sanitized/spoken-aloud-safe spoken text response
   - `ready`: Boolean indicating if minimal requirements are met

### Current Intent Capabilities
- **Create / Edit Draft Invoice or Quote**: Extracts line items and client info; updates existing draft in client state.
- **Create / Edit Draft Expense**: Extracts expense amount, vendor, category, and date.
- **Basic Missing Information Prompting**: Prompts for missing client name or missing line item prices.

### Key Gaps in Conversational Capability
- **No direct navigation execution**: Asking "take me to my settings" or "show unpaid invoices" returns text rather than triggering UI routing/filtering.
- **No record querying or search tool execution**: Asking "find the invoice I sent to John last week" cannot search Supabase database records.
- **No in-chat visual reporting or chart generation**: Cannot generate dynamic revenue/expense bar charts, pie charts, or custom PDF exports directly inside the conversation.
- **No multi-step workflow execution**: Converting a quote to an invoice or attaching an expense to a specific job is not accessible via chat tools.

---

## 3. Brittle Language-Handling Rules & Failure Cases

1. **Strict Regex for Tax / Deposit Extraction**:
   - `statedTaxRates` uses trailing regex matching on text. Complex conversational phrasing (e.g. "add 8% tax and 20% down payment for John") can occasionally misattribute tax vs deposit signals if word order varies.
2. **Generic Name Detection**:
   - `isGenericClientName` relies on regex lists (`GENERIC_BARE`, `GENERIC_WITH_ARTICLE`). If a user says "charge the landlord John", regexes can struggle to isolate "John" cleanly without AI intent refinement.
3. **Priceless Line Item Loop**:
   - When a line item lacks a price, `priceQuestion()` constructs a prompt, but multi-turn context sometimes loses earlier line items if the user's next turn only gives a single number without referencing the description.
4. **Dollar Stating Guard**:
   - `POST /api/parse` forcibly strips sentences containing `$` or price figures from AI replies to prevent conflicting numbers. If the AI includes explanation text alongside money, useful explanation prose can be accidentally trimmed.
5. **Lack of Fuzzy Search / Exact Match Constraints**:
   - Client lookup in `/api/parse` requires exact string match for duplicate warnings. Spoken speech-to-text variations ("Jon" vs "John") fail duplicate check and client lookup.

---

## 4. Map of Existing Preview Components & Data Flows

### In-Chat Preview Cards (`src/app/(app)/chat/page.tsx`)
1. **`SavePromptCard.tsx`**:
   - **Trigger**: Displayed in chat when `draft` object exists (intent: `invoice` or `quote`).
   - **Data Props**: Receives `draft` (`ExtractResult` format), client ID if matched, line items, totals.
   - **Interactions**:
     - Edit Line Items / Client / Deposit inline.
     - "Save & Preview" button commits draft to Supabase (`invoices` table) as `status='draft'` and redirects or displays finalized draft.
2. **`ExpenseCard.tsx` / `LoggedExpenseCard.tsx`**:
   - **Trigger**: Displayed when `intent: 'expense'` and `expense` payload is present.
   - **Data Props**: `{ amount, category, vendor, occurred_on }`.
   - **Interactions**:
     - "Confirm Expense" button posts to Supabase `expenses` table.
     - Inline dropdown to adjust `category` or `vendor`.
3. **`ReceiptBubble.tsx`**:
   - **Trigger**: Displayed when a receipt photo is uploaded via chat menu.
   - **Data Flow**: Invokes `/api/parse-receipt` with image base64, returns extracted expense object, renders editable preview card.

---

## 5. Architectural Assessment

### AI & Speech Infrastructure
- **Text Analysis**: Anthropic Claude Haiku 4.5 (`@anthropic-ai/sdk`) invoked server-side in `/api/parse`.
- **Audio Transcription**: `/api/transcribe` uses OpenAI Whisper API or Web Speech API client-side.
- **Voice Realtime Target**: Needs an OpenAI Realtime API (`gpt-4o-realtime-preview`) bridge over WebSockets/WebRTC for low-latency voice streaming, barge-in detection, and voice activity detection (VAD).

### Backend & Database (Supabase PostgreSQL)
- **RLS Policies**: Row-Level Security enforced on all tables (`invoices`, `expenses`, `clients`, `products`, `profiles`, `recurring_schedules`, `recaps`).
- **Idempotency & Document Locking**: Invoices have finalized lock triggers preventing mutation once sent (`20260918000007_lock_sent_invoice_fields.sql`).
- **Financial Calculations**: Calculated strictly in code (`src/lib/financials.ts` via `calculateInvoiceTotals`) to guarantee zero floating point or model estimation drift.

### Rate Limiting & Access Rules
- Managed via Upstash Redis (`src/lib/ratelimit.ts`).
- Paywalls and entitlements enforced via `src/lib/paywall.ts` (3 free quotes, 5 free expenses, paid subscriptions). Conversational tool execution MUST enforce these same restrictions.

---

## 6. Unified Capability Registry & Tool Mapping

| Capability | Intent / Tool Key | Input Schema | Execution Action | Output Format |
|---|---|---|---|---|
| **Create/Update Invoice** | `create_invoice` | `{ client_name, line_items, tax_rate, deposit_type, deposit_value, due_date, notes }` | Updates chat draft or creates `invoices` draft record | Interactive `SavePromptCard` |
| **Create/Update Expense** | `create_expense` | `{ amount, category, vendor, occurred_on }` | Updates chat expense draft or creates `expenses` record | Interactive `ExpenseCard` |
| **Search Records** | `search_records` | `{ query, record_type: 'invoice'\|'quote'\|'expense'\|'client', status, date_range }` | Queries Supabase DB with filter/ILIKES | Interactive Record List Component |
| **Financial Summary & Chart** | `financial_summary` | `{ period: 'week'\|'month'\|'year', comparison: boolean, category_breakdown: boolean }` | Aggregates DB transactions in `financials.ts` | Embedded Interactive Chart / Visual Summary Card |
| **Generate Report PDF** | `generate_report_pdf` | `{ type: 'transactions'\|'expenses'\|'tax', start_date, end_date }` | Invokes `src/lib/pdf/generate.ts` | PDF Download / View Card in Chat |
| **Navigate UI** | `navigate_ui` | `{ destination: 'invoices'\|'expenses'\|'settings'\|'dashboard'\|'summary'\|'clients', filter }` | Client-side `router.push()` with state | UI Navigation & Toast |
| **Set Preference** | `save_preference` | `{ key, value }` | Persists user preference to Supabase `profiles.preferences` | Confirmation Message |

---

## 7. Prioritized Roadmap & Execution Strategy

1. **Phase 1: Architecture & Intelligence Upgrade**
   - Refactor `/api/parse` and `src/lib/ai.ts` to support expanded multi-tool intent classification without breaking existing `SavePromptCard` / `ExpenseCard` schema.
   - Add user preferences storage in Supabase `profiles` table.
2. **Phase 2: Realtime Voice Prototype**
   - Create WebSocket / WebRTC token server endpoint (`/api/realtime/session`) interfacing with OpenAI Realtime API.
   - Integrate voice session controls in Chat page with barge-in support and turn detection.
3. **Phase 3: Capability Registry & Visual Intelligence**
   - Implement tool router executing database queries, dynamic in-chat charts (SVG/CSS Warm Premium responsive charts), and PDF report generation.
4. **Phase 4: Personalization, Feedback & Verification**
   - Implement preference retention, lightweight workflow feedback, and end-to-end testing.
