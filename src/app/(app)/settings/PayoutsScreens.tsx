'use client';
// /settings/payouts (index) and /settings/payouts/<method> (detail). Same
// grouped-row pattern as Help & feedback: one row per payment method with its
// status on the right; tapping a row opens that method's own edit view.
//
// Save paths are the pre-revamp ones, unchanged:
//   Stripe   — /api/connect/onboard + /api/connect/status; card switch via save()
//   Bank     — /api/bank (BankTransferCard)
//   Zelle    — /api/zelle (encrypted at rest; only the mask comes back)
//   PayPal / Cash App / Venmo — save() on their own profiles column. Each is a
//     single-column update, so saving one never touches the other two.
// State (profile, save(), the Zelle mask, Connect actions) stays in SettingsView;
// this file only renders.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import BrandMark from '@/components/BrandMark';
import { SettingsGroup, SettingsRow } from './SettingsRows';
import BankTransferCard, { type BankState } from './BankTransferCard';
import {
  bankStatus, handleStatus, stripeStatus, zelleStatus,
  type PayoutMethod, type PayoutStatus,
} from '@/lib/payout-status';

export const PAYOUTS_INDEX = '/settings/payouts';
// Back to the index after a save: ?saved=1 shows the usual "Saved" banner there.
const INDEX_SAVED = `${PAYOUTS_INDEX}?saved=1`;

// Users paste full URLs and prefixed handles; each field normalizes (on blur and
// on Save) to the bare handle that gets stored, stripping the site / scheme /
// www and the method's sigil. Zelle is intentionally NOT normalized — it's a
// phone or email, both valid as typed.
const normalizePaypal = (v: string) =>
  v.trim().replace(/^(?:https?:\/\/)?(?:www\.)?paypal\.me\//i, '').replace(/\/+$/, '');
const normalizeCashapp = (v: string) =>
  v.trim().replace(/^(?:https?:\/\/)?(?:www\.)?cash\.app\//i, '').replace(/^\$/, '').replace(/\/+$/, '');
const normalizeVenmo = (v: string) =>
  v.trim().replace(/^(?:https?:\/\/)?(?:www\.)?venmo\.com\/u\//i, '').replace(/^@/, '').replace(/\/+$/, '');
// A bare PayPal username has no dots or slashes; anything with them (e.g. a
// domain like "mypaypal.com") would build a broken paypal.me/<...> link.
const isValidPaypalHandle = (v: string) => !/[./\\]/.test(v);
const PAYPAL_ERROR = 'Enter just your PayPal.me username — no URLs, dots, or slashes.';

type HandleMethod = 'paypal' | 'cashapp' | 'venmo';
const HANDLES: Record<HandleMethod, {
  key: 'paypal_me' | 'cashapp_tag' | 'venmo_username'; placeholder: string; normalize: (v: string) => string;
}> = {
  paypal:  { key: 'paypal_me',      placeholder: 'Enter your paypal.me username', normalize: normalizePaypal },
  cashapp: { key: 'cashapp_tag',    placeholder: 'Enter your $cashtag',           normalize: normalizeCashapp },
  venmo:   { key: 'venmo_username', placeholder: 'Enter your username',           normalize: normalizeVenmo },
};

const METHOD_INFO: Record<PayoutMethod, { label: string; hint: string; mark?: { src: string; color: string } }> = {
  stripe:  { label: 'Card & digital wallets', hint: 'Accept cards & online payments' },
  bank:    { label: 'Bank transfer', hint: 'Direct deposit / ACH' },
  zelle:   { label: 'Zelle',    hint: 'Phone or email',     mark: { src: '/brands/zelle.svg',   color: '#6D1ED4' } },
  cashapp: { label: 'Cash App', hint: '$cashtag',           mark: { src: '/brands/cashapp.svg', color: '#00D632' } },
  paypal:  { label: 'PayPal',   hint: 'paypal.me/username', mark: { src: '/brands/paypal.svg',  color: '#003087' } },
  venmo:   { label: 'Venmo',    hint: '@username',          mark: { src: '/brands/venmo.svg',   color: '#008CFF' } },
};

// Brand marks sit in the same 32 px tile as the Material icons, at icon size.
const tileMark = (m: PayoutMethod) => {
  const mark = METHOD_INFO[m].mark!;
  return <BrandMark src={mark.src} color={mark.color} className="h-[19px] w-[19px]" />;
};

// ── Index ─────────────────────────────────────────────────────────────
// Section order matches the pay page: card, then bank, then the apps.
export function PayoutsIndex({ p, zelleMasked, connectOn }: { p: any; zelleMasked: string | null | undefined; connectOn: boolean }) {
  const row = (m: PayoutMethod, s: PayoutStatus, visual: { icon?: 'credit_card' | 'account_balance' }) => (
    <SettingsRow key={m} title={METHOD_INFO[m].label} href={`${PAYOUTS_INDEX}/${m}`}
      icon={visual.icon} tile={visual.icon ? undefined : tileMark(m)}
      value={s.text} valueTone={s.tone} />
  );
  return (
    <>
      <p className="px-1 font-body text-sm text-on-surface-variant">
        Choose how clients can pay you. Everything you set here shows on your pay page.
      </p>
      <SettingsGroup title="Get paid online">
        {row('stripe', stripeStatus(p, connectOn), { icon: 'credit_card' })}
      </SettingsGroup>
      <SettingsGroup title="Bank">
        {row('bank', bankStatus(p), { icon: 'account_balance' })}
      </SettingsGroup>
      <SettingsGroup title="Payment apps">
        {row('zelle', zelleStatus(zelleMasked), {})}
        {row('cashapp', handleStatus('cashapp', p.cashapp_tag), {})}
        {row('paypal', handleStatus('paypal', p.paypal_me), {})}
        {row('venmo', handleStatus('venmo', p.venmo_username), {})}
      </SettingsGroup>
    </>
  );
}

// ── Shared detail layout ──────────────────────────────────────────────
// Back arrow to the index, method name, status badge, the method's helper line,
// then the method's form in one card.
function DetailLayout({ method, badge, children }: {
  method: PayoutMethod; badge: { text: string; on: boolean } | null; children: React.ReactNode;
}) {
  const info = METHOD_INFO[method];
  return (
    <>
      <div className="flex items-center gap-1">
        <Link href={PAYOUTS_INDEX} aria-label="Back to Payouts"
          className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-background active:bg-surface-container">
          <Icon name="arrow_back" size={24} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-[26px] font-extrabold leading-tight text-on-background">{info.label}</h1>
        {badge && (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-body text-xs font-semibold ${badge.on ? 'bg-paid-container text-paid' : 'bg-surface-container text-on-surface-variant'}`}>
            {badge.text}
          </span>
        )}
      </div>
      <p className="px-1 font-body text-sm font-semibold" style={{ color: '#735c00' }}>{info.hint}</p>
      {children}
    </>
  );
}

const CONFIGURED = { text: 'Configured', on: true };

export interface PayoutDetailProps {
  method: PayoutMethod;
  p: any;
  connectOn: boolean;
  /** undefined until GET /api/zelle has answered. */
  zelleMasked: string | null | undefined;
  onZelleChange: (masked: string | null) => void;
  /** SettingsView.save(): optimistic profiles update; false when the write failed. */
  save: (patch: Record<string, unknown>) => Promise<boolean>;
  onBankSaved: (b: BankState) => void;
  connect: { busy: boolean; notice: string; start: () => void };
}

export function PayoutDetail(props: PayoutDetailProps) {
  const { method } = props;
  if (method === 'stripe') return <StripeDetail {...props} />;
  if (method === 'bank') return <BankDetail {...props} />;
  if (method === 'zelle') return <ZelleDetail {...props} />;
  return <HandleDetail {...props} method={method} />;
}

// ── Stripe ────────────────────────────────────────────────────────────
// Four states from the profile's mirrored Stripe status:
//   not connected                        → Connect (creates the account)
//   can't charge, seller owes a due item → Finish setup (resumes onboarding)
//   can't charge, nothing due from them  → In review, no button; Stripe is
//                                          verifying. Status is re-read on
//                                          every load until it flips.
//   charges enabled                      → Connected + the card-payments opt-in
// The stripe_* columns are server-written only; the switch saves
// card_payments_enabled through the normal save() path. Unless Connect is on in
// this deployment, only the disabled "Coming soon" button renders.
function StripeDetail({ p, connectOn, save, connect }: PayoutDetailProps) {
  const badge = connectOn && p.stripe_account_id
    ? { text: p.stripe_charges_enabled ? 'Connected' : p.stripe_details_submitted ? 'In review' : 'Setup incomplete', on: Boolean(p.stripe_charges_enabled) }
    : null;
  return (
    <DetailLayout method="stripe" badge={badge}>
      <section className="card space-y-3">
        <div className="flex items-center gap-3">
          <BrandMark src="/brands/stripe.svg" color="#635BFF" />
          <h2 className="font-display text-xl font-bold text-on-background">Stripe</h2>
        </div>
        {connectOn !== true ? (
          <button type="button" disabled
            className="pointer-events-none w-full rounded-button px-4 py-3 font-body text-sm font-semibold text-white"
            style={{ background: '#5f09b2' }}>
            Coming soon
          </button>
        ) : (
          <>
            {p.stripe_account_id && !p.stripe_charges_enabled && (
              <p className="font-body text-sm text-on-surface-variant">
                {p.stripe_details_submitted
                  ? 'Stripe is reviewing your account. Card payments turn on once they approve it.'
                  : 'Finish setting up your Stripe account to start taking card payments.'}
              </p>
            )}
            {/* Action only when the seller has something to do: not yet
                connected, or a requirement is currently/past due on them. */}
            {!p.stripe_charges_enabled && (!p.stripe_account_id || !p.stripe_details_submitted) && (
              <button type="button" disabled={connect.busy} onClick={connect.start}
                className="w-full rounded-button px-4 py-3 font-body text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: '#5f09b2' }}>
                {connect.busy ? 'Opening…' : p.stripe_account_id ? 'Finish setup' : 'Connect'}
              </button>
            )}
            {p.stripe_charges_enabled && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-body text-sm text-on-surface-variant">
                    Let clients pay invoices by card. Money goes straight to your Stripe account; Stripe’s card fees apply.
                  </p>
                  <button
                    role="switch"
                    aria-checked={Boolean(p.card_payments_enabled)}
                    aria-label="Accept card payments"
                    onClick={() => void save({ card_payments_enabled: !p.card_payments_enabled })}
                    className={`relative h-8 w-14 shrink-0 rounded-full transition-colors
                      ${p.card_payments_enabled ? 'bg-primary-container' : 'bg-outline-variant'}`}
                  >
                    <span
                      className={`absolute top-1 h-6 w-6 rounded-full bg-surface-container-lowest shadow left-1 transition-transform duration-[160ms]
                        ${p.card_payments_enabled ? 'translate-x-6' : ''}`}
                    />
                  </button>
                </div>
                {!p.stripe_payouts_enabled && (
                  <p className="font-body text-sm text-on-surface-variant">
                    Payouts are paused until Stripe has everything it needs. Check your Stripe dashboard.
                  </p>
                )}
              </>
            )}
            {connect.notice && <p className="font-body text-sm text-on-surface-variant">{connect.notice}</p>}
          </>
        )}
      </section>
    </DetailLayout>
  );
}

// ── Bank ──────────────────────────────────────────────────────────────
// BankTransferCard keeps its pay-page switch, read-only summary and Edit.
// Save / Remove go back to the index; the switch stays here.
function BankDetail({ p, onBankSaved }: PayoutDetailProps) {
  const router = useRouter();
  return (
    <DetailLayout method="bank" badge={p.bank_account_last4 ? CONFIGURED : null}>
      <BankTransferCard initial={p} onSaved={onBankSaved} onDone={() => router.push(INDEX_SAVED)} />
    </DetailLayout>
  );
}

// ── Zelle ─────────────────────────────────────────────────────────────
// Encrypted column via /api/zelle; the stored value is never read back, only
// its mask. An empty value clears it (Remove).
function ZelleDetail({ zelleMasked, onZelleChange }: PayoutDetailProps) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function post(value: string) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/zelle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      const z = await res.json().catch(() => ({}));
      if (!res.ok) { setError("Couldn't save. Try again."); return; }
      onZelleChange(z.set ? z.masked : null);
      router.push(INDEX_SAVED);
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DetailLayout method="zelle" badge={zelleMasked ? CONFIGURED : null}>
      <section className="card space-y-3">
        <input className="input" aria-label="Zelle phone or email"
          placeholder={zelleMasked ? `Zelle: ${zelleMasked}` : 'Phone or email'}
          value={input} onChange={(e) => setInput(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn-primary flex-1 px-4 py-2 text-sm" disabled={busy || !input.trim()} onClick={() => void post(input)}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {zelleMasked && (
            <button className="btn-outline px-4 py-2 text-sm" disabled={busy} onClick={() => void post('')}>Remove</button>
          )}
        </div>
        {error && <p className="font-body text-xs text-error">{error}</p>}
        <p className="font-body text-xs text-on-surface-variant/80">Use the phone number or email enrolled with your bank’s Zelle — it must match, or payments won’t reach you. Stored encrypted.</p>
      </section>
    </DetailLayout>
  );
}

// ── PayPal / Cash App / Venmo ─────────────────────────────────────────
// One profiles column each. Save writes only this method's column; Remove
// sets it to null. PayPal validates the bare username before saving.
function HandleDetail({ method, p, save }: PayoutDetailProps & { method: HandleMethod }) {
  const router = useRouter();
  const { key, placeholder, normalize } = HANDLES[method];
  const stored: string = p[key] ?? '';
  const [value, setValue] = useState(stored);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isPaypal = method === 'paypal';

  async function commit(v: string | null) {
    setBusy(true);
    const ok = await save({ [key]: v });
    setBusy(false);
    if (ok) router.push(INDEX_SAVED);
  }

  function onSave() {
    const v = normalize(value);
    setValue(v);
    if (!v) return;
    if (isPaypal && !isValidPaypalHandle(v)) { setError(PAYPAL_ERROR); return; }
    void commit(v);
  }

  return (
    <DetailLayout method={method} badge={stored ? CONFIGURED : null}>
      <section className="card space-y-3">
        {/* PayPal & Venmo get flagged by password-manager extensions as
            credential fields. autoComplete="off" alone didn't clear the
            indicator (Chrome ignores it on such fields), so we also tell
            1Password (data-1p-ignore) and LastPass (data-lpignore) to skip
            them. Not autoComplete="username" — that would mark the field AS
            a credential. Cash App isn't flagged, so it's left untouched. */}
        <input className="input" aria-label={METHOD_INFO[method].label} placeholder={placeholder}
          {...(method === 'cashapp'
            ? {}
            : { autoComplete: 'off', 'data-1p-ignore': true, 'data-lpignore': 'true' })}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          onBlur={(e) => setValue(normalize(e.target.value))} />
        {error && <p className="font-body text-xs text-error">{error}</p>}
        <div className="flex gap-2">
          <button className="btn-primary flex-1 px-4 py-2 text-sm" disabled={busy || !value.trim()} onClick={onSave}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {stored && (
            <button className="btn-outline px-4 py-2 text-sm" disabled={busy} onClick={() => void commit(null)}>Remove</button>
          )}
        </div>
      </section>
    </DetailLayout>
  );
}
