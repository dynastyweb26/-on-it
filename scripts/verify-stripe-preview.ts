// Layer 2: fire a REAL Stripe test-mode checkout.session.completed at the
// preview's Connect webhook and watch the ledger react. Read-only against the
// database (SQL via the Supabase CLI); it inserts and deletes nothing, and it
// cleans nothing up: soft-delete the ZZ TEST invoice in the app afterwards.
//
//   node --import ./scripts/test-register.mjs scripts/verify-stripe-preview.ts <invoice-uuid>
//
// Needs: STRIPE_SECRET_KEY (sk_test_… of the sandbox the preview webhook is
// registered in), the Stripe CLI on PATH, the linked Supabase project, and an
// existing UNPAID invoice whose client_name starts with "ZZ TEST", owned by the
// "ZZ Test Seller" profile (REFUNDS-DISPUTES-TEST.md). The session is created
// on that profile's connected account, so the route's owner cross-check passes.
import { spawnSync } from 'node:child_process';
import { paymentCheckCandidates, type PaymentCheckInvoice } from '@/lib/payment-check';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLL_MS = 3000;
const POLL_TRIES = 20;

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
if (key.startsWith('sk_live') || key.startsWith('rk_live')) fail('live-mode Stripe key detected; refusing to run');
if (!key.startsWith('sk_test')) fail('STRIPE_SECRET_KEY must be a sk_test_… key');

const invoiceId = process.argv[2] ?? '';
if (!UUID_RE.test(invoiceId)) fail('usage: verify-stripe-preview.ts <invoice-uuid>');

// Read-only SQL through the linked project. The id is a validated UUID.
function query<T = Record<string, unknown>>(sql: string): T[] {
  const run = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--agent', 'no', '--output-format', 'json', sql], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.status !== 0) fail(`supabase db query failed: ${(run.stderr || run.stdout).trim().slice(0, 300)}`);
  const out = JSON.parse(run.stdout.trim());
  return (Array.isArray(out) ? out : out.rows) as T[];
}

const INVOICE_SQL = `select i.id, i.user_id, i.client_name, i.invoice_number, i.total, i.amount_paid, i.status,
  i.due_date, i.sent_at, i.first_sent_at, i.created_at, i.kind, i.deleted_at,
  p.business_name, p.stripe_account_id
  from invoices i join profiles p on p.id = i.user_id where i.id = '${invoiceId}'`;

type Row = PaymentCheckInvoice & { user_id: string; business_name: string | null; stripe_account_id: string | null };

const before = query<Row>(INVOICE_SQL)[0];
if (!before) fail('invoice not found');
if (before.business_name !== 'ZZ Test Seller') fail(`invoice belongs to "${before.business_name}", not the ZZ Test Seller profile`);
if (!before.client_name?.startsWith('ZZ TEST')) fail('client_name must start with "ZZ TEST"');
if (!before.stripe_account_id?.startsWith('acct_')) fail('test seller has no connected acct_ id');
if (before.status === 'paid' || Number(before.amount_paid ?? 0) >= Number(before.total ?? 0)) fail('invoice is already paid; pick an unpaid one');
const account = before.stripe_account_id;

// ── Trigger ────────────────────────────────────────────────────────────────
// `stripe trigger` runs a fixture; --override rewrites a fixture field. The
// route reads metadata.invoice_id, and charges what Stripe charged, so the
// amount override makes the session cover the invoice. Flag spelling is from
// the Stripe CLI docs and was NOT confirmed against `stripe trigger --help`
// (CLI not installed when this was written): confirm before the first run.
const cents = Math.round(Number(before.total) * 100) - Math.round(Number(before.amount_paid ?? 0) * 100);
const args = [
  'trigger', 'checkout.session.completed',
  '--api-key', key,
  '--stripe-account', account,
  '--override', `checkout_session:metadata[invoice_id]=${invoiceId}`,
  '--override', `checkout_session:line_items[0][price_data][unit_amount]=${cents}`,
];
console.log(`Triggering on ${account} for invoice #${before.invoice_number} (${cents} cents)…`);
const trig = spawnSync('stripe', args, { encoding: 'utf8', shell: process.platform === 'win32' });
if (trig.status !== 0) fail(`stripe trigger failed: ${(trig.stderr || trig.stdout).replace(key, '[key]').trim().slice(0, 400)}`);

// ── Poll for the ledger row ────────────────────────────────────────────────
type Pay = { id: string; amount: number; method: string; paid_source: string; stripe_checkout_session_id: string | null; created_at: string };
const PAY_SQL = `select id, amount, method, paid_source, stripe_checkout_session_id, created_at
  from invoice_payments where invoice_id = '${invoiceId}' and paid_source = 'webhook' order by created_at desc limit 5`;

let pay: Pay | undefined;
for (let i = 0; i < POLL_TRIES && !pay; i++) {
  await new Promise((r) => setTimeout(r, POLL_MS));
  pay = query<Pay>(PAY_SQL)[0];
}
if (!pay) fail(`no webhook ledger row after ${(POLL_MS * POLL_TRIES) / 1000}s (is the preview endpoint + secret set up?)`);

const after = query<Row>(INVOICE_SQL)[0];
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const stillQueued = paymentCheckCandidates([after], { now: new Date(now.getTime() + 7 * 86400e3), today }).length > 0;

const checks: [string, boolean][] = [
  ["paid_source = 'webhook'", pay.paid_source === 'webhook'],
  [`method is card (got ${pay.method})`, pay.method === 'card'],
  ["invoice status = 'paid'", after.status === 'paid'],
  ['invoice no longer a Payment Check candidate', !stillQueued],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);

console.log('\nObserved ids (soft-delete the invoice in the app; nothing was cleaned up):');
console.log(`  invoice          ${invoiceId}  (#${after.invoice_number}, ${after.client_name})`);
console.log(`  ledger row       ${pay.id}`);
console.log(`  checkout session ${pay.stripe_checkout_session_id}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
