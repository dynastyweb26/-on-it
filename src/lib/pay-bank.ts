// Pay page bank transfer gate (BANK-TRANSFER-SPEC.md commit 2 · 7).
//
// get_public_invoice_bank (20261016000000) already returns zero rows unless
// the invoice is a sent/overdue, unpaid, non-deleted invoice whose owner has
// bank transfer on. This is the second, app-side check on the row it hands
// back: anything paid, void, a quote, not sent/overdue, or missing a field
// → null, so the pay page model carries no bank data at all.
//
// Tap-to-reveal: the page model gets only the masked account (last 4) via
// pageBank. The full number is sent only by POST /api/pay/[token]/bank
// (revealBankAccount below), rate limited per token and per IP, behind the
// same RPC and the same publicBank gate.
// Pure: unit-tested in pay-bank.test.ts.

import { dueNowFromLedger } from './financials';

export interface PublicBankRow {
  holder_name: string | null;
  bank_name: string | null;
  routing: string | null;
  account: string | null;
  account_type: string | null;
}

/** Server-side only: carries the full account number. Never put it in a page model. */
export interface PublicBank {
  holderName: string;
  bankName: string;
  routing: string;
  account: string;
  accountType: 'checking' | 'savings';
}

/** What the pay page model carries: the account number masked to its last 4. */
export interface PayBank {
  holderName: string;
  bankName: string;
  routing: string;
  accountLast4: string;
  accountType: 'checking' | 'savings';
}

export interface BankGate {
  kind: 'invoice' | 'quote';
  status: string | null;
  fullyPaid: boolean;
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t.length ? t : null;
};

export function publicBank(row: PublicBankRow | null | undefined, gate: BankGate): PublicBank | null {
  if (!row) return null;
  if (gate.kind !== 'invoice' || gate.fullyPaid) return null;
  if (gate.status !== 'sent' && gate.status !== 'overdue') return null; // draft, paid, void
  const holderName = clean(row.holder_name);
  const bankName = clean(row.bank_name);
  const routing = clean(row.routing);
  const account = clean(row.account);
  const accountType = row.account_type === 'savings' ? 'savings' : row.account_type === 'checking' ? 'checking' : null;
  if (!holderName || !bankName || !routing || !account || !accountType) return null;
  return { holderName, bankName, routing, account, accountType };
}

/** The page-model form: drops the full account number, keeps its last 4. */
export function pageBank(bank: PublicBank | null): PayBank | null {
  if (!bank) return null;
  const { account, ...rest } = bank;
  return { ...rest, accountLast4: account.slice(-4) };
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The fields of a get_public_invoice row the bank gate reads. */
export interface PublicInvoiceGateRow {
  kind: string | null;
  status: string | null;
  total: number | string | null;
  deposit_amount: number | string | null;
  amount_paid: number | string | null;
}

/** The gate exactly as the pay page computes it (dueNowFromLedger for "fully paid"). */
export function bankGateFor(row: PublicInvoiceGateRow): BankGate {
  const { fullyPaid } = dueNowFromLedger(num(row.total), num(row.deposit_amount), num(row.amount_paid));
  return { kind: row.kind === 'quote' ? 'quote' : 'invoice', status: row.status, fullyPaid };
}

// ── Reveal (POST /api/pay/[token]/bank) ───────────────────────────────────
// The route wires the real limiter and RPCs in; tests pass fakes.

// Same shape check as the pay page: base64url, ≤ 32 chars.
export const PAY_TOKEN_RE = /^[A-Za-z0-9_-]{1,32}$/;

export interface RevealDeps {
  /** true = allowed. Called for the IP bucket first, then the token bucket. */
  limit: (bucket: 'ip' | 'token', id: string) => Promise<boolean>;
  /** get_public_invoice row(s) for the token (service role). Throws on RPC error. */
  invoice: (token: string) => Promise<PublicInvoiceGateRow | null>;
  /** get_public_invoice_bank row(s) for the token (service role). Throws on RPC error. */
  bank: (token: string) => Promise<PublicBankRow | null>;
}

export type RevealResult =
  | { status: 200; body: { account: string } }
  | { status: 404; body: { error: 'not found' } }
  | { status: 429; body: { error: 'rate limited' } }
  | { status: 500; body: { error: 'unavailable' } };

const NOT_FOUND = { status: 404, body: { error: 'not found' } } as const;

/** Full account number for a payable invoice's pay page, or 404 for anything
 *  else (bad token, quote, draft, paid, void, deleted, bank transfer off) —
 *  indistinguishable on purpose, so a token can't be probed with it. */
export async function revealBankAccount(token: string, ip: string, deps: RevealDeps): Promise<RevealResult> {
  if (!(await deps.limit('ip', `ip:${ip}`))) return { status: 429, body: { error: 'rate limited' } };
  if (!PAY_TOKEN_RE.test(token)) return NOT_FOUND;
  if (!(await deps.limit('token', `token:${token}`))) return { status: 429, body: { error: 'rate limited' } };
  try {
    const [inv, row] = await Promise.all([deps.invoice(token), deps.bank(token)]);
    if (!inv) return NOT_FOUND;
    const bank = publicBank(row, bankGateFor(inv));
    return bank ? { status: 200, body: { account: bank.account } } : NOT_FOUND;
  } catch {
    return { status: 500, body: { error: 'unavailable' } };
  }
}
