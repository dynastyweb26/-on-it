import 'server-only';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/ratelimit';
import { docNoun, formatDocNumber } from '@/lib/documents';
import { roundCurrency, calculateLineAmount } from '@/lib/financials';
import Icon from '@/components/Icon';
import PayView, { type PayModel } from './PayView';

// ─────────────────────────────────────────────────────────────────────────
// Public, unauthenticated pay page: /pay/[token].
//
// Lives OUTSIDE the (app) group on purpose — the per-page client auth guards
// there would bounce a signed-out client to /login. The refresh-only
// middleware never redirects and now skips pay/ entirely, so a guest reaches
// this route with no session.
//
// The ONLY data path is the service-role get_public_invoice RPC, which returns
// an explicit whitelist (no owner id, no client PII, no tax/subtotal, line
// items re-projected) and decrypts Zelle server-side with ZELLE_ENC_KEY. This
// component runs the admin client (RLS-bypassing) — so it must call NOTHING
// else against the DB. Never add a table query here.
// ─────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'; // per-request: headers + live invoice data
export const metadata: Metadata = {
  title: 'Pay your invoice — On It',
  // Bearer-token links must never be indexed.
  robots: { index: false, follow: false },
};

// public_token is base64url from gen_random_bytes(16) → 22 chars, capped at 32
// by the column check. Validate the shape before spending an RPC call, and treat
// anything else as not-found (indistinguishable from a real miss).
const TOKEN_RE = /^[A-Za-z0-9_-]{1,32}$/;

interface PublicInvoiceRow {
  business_name: string | null;
  logo_url: string | null;
  invoice_number: number;
  kind: string | null;
  line_items: { description?: string; qty?: unknown; unit_price?: unknown }[] | null;
  // subtotal/tax_rate/tax_amount added by 20260918000009; absent (undefined)
  // until that migration is applied — the model degrades to no breakdown.
  subtotal: number | string | null;
  tax_rate: number | string | null;
  tax_amount: number | string | null;
  total: number | string | null;
  deposit_type: string | null;
  deposit_value: number | string | null;
  deposit_amount: number | string | null;
  amount_paid: number | string | null;
  status: string | null;
  paypal_me: string | null;
  cashapp_tag: string | null;
  venmo_username: string | null;
  zelle: string | null;
}

type FetchResult =
  | { ok: true; row: PublicInvoiceRow }
  | { ok: false; reason: 'notfound' | 'error' };

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clean = (v: string | null): string | null => {
  const t = (v ?? '').trim();
  return t.length ? t : null;
};

async function fetchPublicInvoice(token: string): Promise<FetchResult> {
  // p_key decrypts Zelle inside the RPC; it stays server-side and never reaches
  // the client. A row without Zelle never invokes decrypt, so a missing key only
  // breaks rows that actually set Zelle — those surface as an 'error' state, not
  // a false not-found.
  const key = process.env.ZELLE_ENC_KEY ?? '';
  try {
    const { data, error } = await adminClient().rpc('get_public_invoice', {
      p_token: token,
      p_key: key,
    });
    if (error) {
      console.error('get_public_invoice failed', error.message);
      return { ok: false, reason: 'error' };
    }
    const rows = (data as PublicInvoiceRow[] | null) ?? [];
    if (!rows.length) return { ok: false, reason: 'notfound' };
    return { ok: true, row: rows[0]! };
  } catch (e) {
    console.error('get_public_invoice threw', e);
    return { ok: false, reason: 'error' };
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-container py-10 text-center">
      {children}
    </main>
  );
}

function Notice({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <Shell>
      <Icon name={icon} size={48} className="text-on-surface-variant" />
      <h1 className="mt-3 font-display text-headline-lg text-on-background">{title}</h1>
      <p className="mt-2 max-w-sm text-body-md text-on-surface-variant">{body}</p>
    </Shell>
  );
}

function buildModel(row: PublicInvoiceRow): PayModel {
  const kind = row.kind === 'quote' ? 'quote' : 'invoice';
  const subtotal = num(row.subtotal);
  const taxRate = num(row.tax_rate);
  const taxAmount = num(row.tax_amount);
  const total = num(row.total);
  const paid = Math.max(0, num(row.amount_paid));
  const depositAmount = Math.min(Math.max(num(row.deposit_amount), 0), Math.max(total, 0));
  const fullyPaid = total > 0 && paid >= total;

  // due-now / balance are derived from the AUTHORITATIVE row.total (tax already
  // baked in — get_public_invoice deliberately omits tax_rate/subtotal), never
  // recomputed from line items. Mirrors calculateInvoiceTotals' dueNow rule.
  let dueNow = 0;
  if (total > 0 && paid < total) {
    dueNow =
      depositAmount > 0 && paid < depositAmount
        ? roundCurrency(depositAmount - paid)
        : roundCurrency(total - paid);
  }

  let primaryLabel: string;
  let primaryAmount: number;
  if (fullyPaid) {
    primaryLabel = 'Paid in full';
    primaryAmount = total;
  } else if (depositAmount > 0 && paid < depositAmount) {
    primaryLabel = 'Deposit due now';
    primaryAmount = dueNow;
  } else if (paid > 0) {
    primaryLabel = 'Balance due';
    primaryAmount = dueNow;
  } else {
    primaryLabel = kind === 'quote' ? 'Quoted total' : 'Total due';
    primaryAmount = dueNow;
  }

  const lineItems = (row.line_items ?? []).map((li) => {
    const qty = num(li.qty);
    const unitPrice = num(li.unit_price);
    return {
      description: String(li.description ?? ''),
      qty,
      unitPrice,
      amount: calculateLineAmount(qty, unitPrice),
    };
  });

  // A fully-paid invoice exposes NO payment methods — strip the handles from the
  // model entirely (not just hide them in the view), so a paid invoice's page
  // payload carries no Zelle/PayPal/Cash App/Venmo at all.
  const handles = fullyPaid
    ? { paypalMe: null, cashappTag: null, venmoUsername: null, zelle: null }
    : {
        paypalMe: clean(row.paypal_me),
        cashappTag: clean(row.cashapp_tag),
        venmoUsername: clean(row.venmo_username),
        zelle: clean(row.zelle),
      };

  return {
    businessName: clean(row.business_name) ?? 'This business',
    logoUrl: clean(row.logo_url),
    docNumber: formatDocNumber(kind, row.invoice_number),
    noun: docNoun(kind),
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    // Show the Subtotal/Tax/Total breakdown only when there's tax to reconcile
    // (also the graceful fallback when 20260918000009 isn't applied yet: the
    // fields are absent → taxAmount 0 → no breakdown, current behavior).
    showTaxBreakdown: taxAmount > 0,
    total,
    primaryLabel,
    primaryAmount,
    showTotalSubline: roundCurrency(primaryAmount) !== roundCurrency(total),
    amountPaid: paid,
    fullyPaid,
    hasHandles: Object.values(handles).some(Boolean),
    handles,
  };
}

export default async function PayPage({ params }: { params: { token: string } }) {
  // Rate-limit by IP (public route). rateIdentifier wants a NextRequest we don't
  // have in a server component, so derive the same ip:<addr> identifier from the
  // forwarded headers directly (matches clientIp()'s logic in ratelimit.ts).
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  const ip = xff ? xff.split(',')[0]!.trim() : (h.get('x-real-ip') ?? 'unknown');
  if (!(await rateLimit('pay_view', `ip:${ip}`))) {
    return (
      <Notice
        icon="hourglass_empty"
        title="One moment"
        body="Too many requests just now. Wait a few seconds and refresh this page."
      />
    );
  }

  if (!TOKEN_RE.test(params.token)) {
    return (
      <Notice
        icon="link_off"
        title="This link isn’t valid"
        body="Double-check the link from the business, or ask them to send it again."
      />
    );
  }

  const res = await fetchPublicInvoice(params.token);
  if (!res.ok) {
    if (res.reason === 'error') {
      return (
        <Notice
          icon="error_outline"
          title="Something went wrong"
          body="We couldn’t load this invoice right now. Please try again in a moment."
        />
      );
    }
    // not-found: also covers drafts and soft-deleted invoices — deliberately
    // indistinguishable so a token can't be probed for existence.
    return (
      <Notice
        icon="link_off"
        title="This link isn’t valid"
        body="Double-check the link from the business, or ask them to send it again."
      />
    );
  }

  return <PayView model={buildModel(res.row)} />;
}
