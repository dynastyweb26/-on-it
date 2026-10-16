// Pay page bank transfer gate (BANK-TRANSFER-SPEC.md commit 2 · 7).
//
// get_public_invoice_bank (20261016000000) already returns zero rows unless
// the invoice is a sent/overdue, unpaid, non-deleted invoice whose owner has
// bank transfer on. This is the second, app-side check on the row it hands
// back: anything paid, void, a quote, not sent/overdue, or missing a field
// → null, so the pay page model carries no bank data at all.
// Pure: unit-tested in pay-bank.test.ts.

export interface PublicBankRow {
  holder_name: string | null;
  bank_name: string | null;
  routing: string | null;
  account: string | null;
  account_type: string | null;
}

export interface PayBank {
  holderName: string;
  bankName: string;
  routing: string;
  account: string; // full number: the payer must copy it; masked on screen until tapped
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

export function publicBank(row: PublicBankRow | null | undefined, gate: BankGate): PayBank | null {
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
