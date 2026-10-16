'use client';
// Bank transfer (US ACH / direct deposit) form for /settings/payouts/bank;
// the detail layout supplies the header and "Configured" badge. Every
// write goes through /api/bank (server-side validation + encryption); the
// account number is never read back, only its last four (••••4417).
// Changing the account number means typing it twice; leaving both boxes
// blank keeps the stored one.
import { useState } from 'react';
import { BankDetailsSchema, firstBankError, maskAccount } from '@/lib/bank';

export interface BankState {
  bank_holder_name: string | null;
  bank_name: string | null;
  bank_routing: string | null;
  bank_account_last4: string | null;
  bank_account_type: 'checking' | 'savings' | null;
  bank_transfer_enabled: boolean | null;
}

// Account fields aren't credentials — keep password managers off them
// (same reasoning as the PayPal / Venmo inputs).
const NO_PM = { autoComplete: 'off', 'data-1p-ignore': true, 'data-lpignore': 'true' } as const;

export default function BankTransferCard({ initial, onSaved, onDone }: {
  initial: BankState; onSaved: (s: BankState) => void;
  /** After a successful Save or Remove (not the pay-page switch). */
  onDone?: () => void;
}) {
  const [bank, setBank] = useState<BankState>(initial);
  const configured = Boolean(bank.bank_account_last4);
  const [editing, setEditing] = useState(!configured);
  const [holderName, setHolderName] = useState(bank.bank_holder_name ?? '');
  const [bankName, setBankName] = useState(bank.bank_name ?? '');
  const [routing, setRouting] = useState(bank.bank_routing ?? '');
  const [account, setAccount] = useState('');
  const [accountConfirm, setAccountConfirm] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>(bank.bank_account_type ?? 'checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/bank', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === 'string' && json.error !== 'save failed' ? json.error : "Couldn't save. Try again.");
        return false;
      }
      const next: BankState = json.bank ?? initial;
      setBank(next);
      onSaved(next);
      return true;
    } catch {
      setError("Couldn't save. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const changingAccount = Boolean(account.trim() || accountConfirm.trim());
    const payload = {
      holderName, bankName, routing, accountType,
      enabled: Boolean(bank.bank_transfer_enabled),
      ...(changingAccount || !configured ? { account, accountConfirm } : {}),
    };
    const parsed = BankDetailsSchema.safeParse(payload);
    if (!parsed.success) { setError(firstBankError(parsed)); return; }
    if (await post({ action: 'save', ...payload })) {
      setAccount('');
      setAccountConfirm('');
      setEditing(false);
      onDone?.();
    }
  }

  async function remove() {
    if (await post({ action: 'clear' })) {
      setHolderName(''); setBankName(''); setRouting(''); setAccount(''); setAccountConfirm('');
      setAccountType('checking');
      setEditing(true);
      onDone?.();
    }
  }

  const enabled = Boolean(bank.bank_transfer_enabled);

  return (
    <section className="card space-y-3">
      {configured && (
        <div className="flex items-center justify-between gap-3">
          <p className="font-body text-sm text-on-surface-variant">Show these details on your pay page.</p>
          <button
            role="switch"
            aria-checked={enabled}
            aria-label="Show bank transfer on the pay page"
            disabled={busy}
            onClick={() => void post({ action: 'enable', enabled: !enabled })}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors
              ${enabled ? 'bg-primary-container' : 'bg-outline-variant'}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-surface-container-lowest shadow left-1 transition-transform duration-[160ms]
                ${enabled ? 'translate-x-6' : ''}`}
            />
          </button>
        </div>
      )}

      {configured && !editing ? (
        <>
          <dl className="space-y-1 font-body text-sm">
            <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Account holder</dt><dd className="truncate font-semibold text-on-background">{bank.bank_holder_name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Bank</dt><dd className="truncate font-semibold text-on-background">{bank.bank_name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Routing</dt><dd className="font-semibold text-on-background">{bank.bank_routing}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Account</dt><dd className="font-semibold text-on-background">{maskAccount(bank.bank_account_last4!)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Type</dt><dd className="font-semibold capitalize text-on-background">{bank.bank_account_type}</dd></div>
          </dl>
          <div className="flex gap-2">
            <button className="btn-primary flex-1 px-4 py-2 text-sm" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
            <button className="btn-outline px-4 py-2 text-sm" disabled={busy} onClick={remove}>Remove</button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <input className="input" placeholder="Account holder name" maxLength={100}
            value={holderName} onChange={(e) => setHolderName(e.target.value)} {...NO_PM} />
          <input className="input" placeholder="Bank name" maxLength={100}
            value={bankName} onChange={(e) => setBankName(e.target.value)} {...NO_PM} />
          <input className="input" placeholder="Routing number (9 digits)" inputMode="numeric" maxLength={11}
            value={routing} onChange={(e) => setRouting(e.target.value)} {...NO_PM} />
          <input className="input" inputMode="numeric" maxLength={21}
            placeholder={configured ? `Account ${maskAccount(bank.bank_account_last4!)} — leave blank to keep` : 'Account number'}
            value={account} onChange={(e) => setAccount(e.target.value)} {...NO_PM} />
          <input className="input" inputMode="numeric" maxLength={21}
            placeholder="Re-enter account number"
            value={accountConfirm} onChange={(e) => setAccountConfirm(e.target.value)} {...NO_PM} />
          <div className="flex gap-2">
            {(['checking', 'savings'] as const).map((t) => (
              <button key={t} className={`chip flex-1 capitalize ${accountType === t ? 'chip-selected' : ''}`}
                onClick={() => setAccountType(t)}>{t}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1 px-4 py-2 text-sm" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            {configured && (
              <button className="btn-outline px-4 py-2 text-sm" disabled={busy}
                onClick={() => { setEditing(false); setError(''); setAccount(''); setAccountConfirm(''); }}>Cancel</button>
            )}
          </div>
        </div>
      )}

      {error && <p className="font-body text-xs text-error">{error}</p>}
      <p className="font-body text-xs text-on-surface-variant/80">
        US bank accounts only. Your clients see these details on your pay page so they can send a transfer — never on the PDF. Account number stored encrypted.
      </p>
    </section>
  );
}
