/* ═══ ON IT — The 4 invoice templates ═══
   Rendered as HTML at 794×1123px (A4 @ 96dpi), captured by html2canvas → jsPDF.
   Each template is a genuinely different LAYOUT, not a reskin:

   1. classic    — centered header, ruled table. The safe professional default.
   2. sidebar    — bold color band down the left with logo + business info.
   3. industrial — full-bleed dark-style header block, heavy type, hard edges.
                   (Cyril's black/red invoice energy lives here.)
   4. friendly   — rounded cards, soft spacing, approachable. Built from scratch.

   Color roles come from buildTheme(): background (user-chosen), text
   (white on dark / black on light), primary (headers), accent (totals,
   website, slogan, dividers).                                              */

import React from 'react';
import { BrandTheme, onColor } from '@/lib/colors';
import type { LineItem } from '@/lib/ai';

export interface InvoiceRenderData {
  kind: 'invoice' | 'quote';
  invoiceNumber: number;
  businessName: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  slogan?: string | null;
  clientName: string;
  clientAddress?: string | null;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string | null;
  issuedDate: string;
  dueDate?: string | null;
  zelle?: string | null;
  paypalMe?: string | null;
  cashappTag?: string | null;
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const PAGE: React.CSSProperties = {
  width: 794,
  minHeight: 1123,
  boxSizing: 'border-box',
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  position: 'relative',
};

function PaymentBlock({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  const rows = [
    d.zelle && `Zelle: ${d.zelle}`,
    d.cashappTag && `Cash App: ${d.cashappTag}`,
    d.paypalMe && `PayPal: paypal.me/${d.paypalMe}`,
  ].filter(Boolean);
  if (!rows.length) return null;
  return (
    <div style={{ fontSize: 13, lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>
        How to pay
      </div>
      {rows.map((r) => (
        <div key={r as string}>{r}</div>
      ))}
    </div>
  );
}

function Totals({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  return (
    <div style={{ width: 260 }}>
      <Row label="Subtotal" value={money(d.subtotal)} />
      {d.taxRate > 0 && <Row label={`Tax (${d.taxRate}%)`} value={money(d.taxAmount)} />}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '10px 14px',
          marginTop: 6,
          background: t.accent,
          color: onColor(t.accent),
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        <span>{d.kind === 'quote' ? 'Quoted total' : 'Total due'}</span>
        <span>{money(d.total)}</span>
      </div>
    </div>
  );
}
const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 14px', fontSize: 14 }}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

function ItemsTable({ d, t, rounded = false }: { d: InvoiceRenderData; t: BrandTheme; rounded?: boolean }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
      <thead>
        <tr style={{ background: t.primary, color: onColor(t.primary) }}>
          {['Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
            <th
              key={h}
              style={{
                textAlign: i === 0 ? 'left' : 'right',
                padding: '10px 12px',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 1,
                borderRadius: rounded ? (i === 0 ? '10px 0 0 10px' : i === 3 ? '0 10px 10px 0' : 0) : 0,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {d.lineItems.map((li, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${t.accent}33` }}>
            <td style={{ padding: '12px' }}>{li.description}</td>
            <td style={{ padding: '12px', textAlign: 'right' }}>{li.qty}</td>
            <td style={{ padding: '12px', textAlign: 'right' }}>{money(li.unit_price)}</td>
            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
              {money(li.qty * li.unit_price)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Meta = ({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) => (
  <div style={{ fontSize: 13, lineHeight: 1.8 }}>
    <div>
      <b style={{ color: t.accent }}>{d.kind === 'quote' ? 'Quote' : 'Invoice'} #</b> INV-
      {String(d.invoiceNumber).padStart(4, '0')}
    </div>
    <div><b style={{ color: t.accent }}>Date</b> {d.issuedDate}</div>
    {d.dueDate && <div><b style={{ color: t.accent }}>Due</b> {d.dueDate}</div>}
  </div>
);

/* ── 1. CLASSIC ─────────────────────────────────────────────── */
function Classic({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  return (
    <div style={{ ...PAGE, background: t.background, color: t.text, padding: 56 }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        {d.logoUrl && <img src={d.logoUrl} style={{ height: 96, marginBottom: 12 }} alt="" />}
        <div style={{ fontSize: 30, fontWeight: 800, color: t.primary === t.background ? t.text : t.primary }}>
          {d.businessName}
        </div>
        {d.slogan && <div style={{ color: t.accent, fontStyle: 'italic', fontSize: 14 }}>{d.slogan}</div>}
        {d.websiteUrl && <div style={{ color: t.accent, fontSize: 13 }}>{d.websiteUrl}</div>}
      </div>
      <div style={{ height: 3, background: t.accent, margin: '24px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: t.accent, fontWeight: 700 }}>
            Billed to
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{d.clientName}</div>
          {d.clientAddress && <div>{d.clientAddress}</div>}
        </div>
        <Meta d={d} t={t} />
      </div>
      <ItemsTable d={d} t={t} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <Totals d={d} t={t} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
        <PaymentBlock d={d} t={t} />
        {d.notes && <div style={{ fontSize: 12, maxWidth: 300, opacity: 0.85 }}>{d.notes}</div>}
      </div>
      <div style={{ position: 'absolute', bottom: 40, left: 56, right: 56, textAlign: 'center', fontSize: 12, color: t.accent }}>
        Thank you for your business.
      </div>
    </div>
  );
}

/* ── 2. SIDEBAR ─────────────────────────────────────────────── */
function Sidebar({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  return (
    <div style={{ ...PAGE, background: t.background, color: t.text, display: 'flex' }}>
      <div style={{ width: 240, background: t.primary, color: onColor(t.primary), padding: '48px 28px', display: 'flex', flexDirection: 'column' }}>
        {d.logoUrl && <img src={d.logoUrl} style={{ width: 144, marginBottom: 20 }} alt="" />}
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{d.businessName}</div>
        {d.slogan && <div style={{ color: t.accent, fontSize: 13, marginTop: 8, fontStyle: 'italic' }}>{d.slogan}</div>}
        <div style={{ marginTop: 'auto', fontSize: 12, lineHeight: 1.8 }}>
          {d.websiteUrl && <div style={{ color: t.accent, fontWeight: 700 }}>{d.websiteUrl}</div>}
          <div style={{ marginTop: 16 }}>
            <PaymentBlock d={d} t={{ ...t, text: onColor(t.primary) }} />
          </div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '48px 40px' }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: t.accent, letterSpacing: 2, textTransform: 'uppercase' }}>
          {d.kind === 'quote' ? 'Quote' : 'Invoice'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '24px 0 32px' }}>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: t.accent, fontWeight: 700 }}>
              Billed to
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{d.clientName}</div>
            {d.clientAddress && <div>{d.clientAddress}</div>}
          </div>
          <Meta d={d} t={t} />
        </div>
        <ItemsTable d={d} t={t} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <Totals d={d} t={t} />
        </div>
        {d.notes && <div style={{ fontSize: 12, marginTop: 32, opacity: 0.85 }}>{d.notes}</div>}
      </div>
    </div>
  );
}

/* ── 3. INDUSTRIAL ──────────────────────────────────────────── */
function Industrial({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  return (
    <div style={{ ...PAGE, background: t.background, color: t.text }}>
      <div style={{ background: t.primary, color: onColor(t.primary), padding: '40px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>
            {d.businessName}
          </div>
          {d.slogan && <div style={{ color: t.accent, fontWeight: 700, fontSize: 14 }}>{d.slogan}</div>}
          {d.websiteUrl && <div style={{ color: t.accent, fontSize: 13, marginTop: 4 }}>{d.websiteUrl}</div>}
        </div>
        {d.logoUrl && <img src={d.logoUrl} style={{ height: 108 }} alt="" />}
      </div>
      <div style={{ background: t.accent, color: onColor(t.accent), padding: '10px 56px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 3, fontSize: 14, display: 'flex', justifyContent: 'space-between' }}>
        <span>{d.kind === 'quote' ? 'Quote' : 'Invoice'} INV-{String(d.invoiceNumber).padStart(4, '0')}</span>
        <span>{d.issuedDate}{d.dueDate ? `  ·  DUE ${d.dueDate}` : ''}</span>
      </div>
      <div style={{ padding: '36px 56px' }}>
        <div style={{ marginBottom: 28, fontSize: 13, lineHeight: 1.8 }}>
          <span style={{ color: t.accent, fontWeight: 800, textTransform: 'uppercase', fontSize: 11, letterSpacing: 2 }}>
            Billed to&nbsp;&nbsp;
          </span>
          <span style={{ fontWeight: 800, fontSize: 17 }}>{d.clientName}</span>
          {d.clientAddress && <span style={{ opacity: 0.8 }}> — {d.clientAddress}</span>}
        </div>
        <ItemsTable d={d} t={t} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28 }}>
          <PaymentBlock d={d} t={t} />
          <Totals d={d} t={t} />
        </div>
        {d.notes && <div style={{ fontSize: 12, marginTop: 32, borderLeft: `4px solid ${t.accent}`, paddingLeft: 12, opacity: 0.9 }}>{d.notes}</div>}
      </div>
    </div>
  );
}

/* ── 4. FRIENDLY ────────────────────────────────────────────── */
function Friendly({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  const card: React.CSSProperties = {
    background: `${t.primary}14`,
    border: `1.5px solid ${t.accent}55`,
    borderRadius: 18,
    padding: 20,
  };
  return (
    <div style={{ ...PAGE, background: t.background, color: t.text, padding: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
        {d.logoUrl && (
          <img src={d.logoUrl} style={{ height: 96, width: 96, borderRadius: 16, objectFit: 'cover' }} alt="" />
        )}
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: t.primary === t.background ? t.text : t.primary }}>
            {d.businessName}
          </div>
          {d.slogan && <div style={{ color: t.accent, fontSize: 13 }}>{d.slogan}</div>}
          {d.websiteUrl && <div style={{ color: t.accent, fontSize: 12 }}>{d.websiteUrl}</div>}
        </div>
        <div style={{ marginLeft: 'auto', background: t.accent, color: onColor(t.accent), borderRadius: 999, padding: '8px 18px', fontWeight: 800, fontSize: 14 }}>
          {d.kind === 'quote' ? 'Quote' : 'Invoice'} #{String(d.invoiceNumber).padStart(4, '0')}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{ ...card, flex: 1 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: t.accent, fontWeight: 700, marginBottom: 6 }}>
            For
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{d.clientName}</div>
          {d.clientAddress && <div style={{ fontSize: 13 }}>{d.clientAddress}</div>}
        </div>
        <div style={{ ...card, width: 220 }}>
          <Meta d={d} t={t} />
        </div>
      </div>
      <div style={{ ...card, padding: 12 }}>
        <ItemsTable d={d} t={t} rounded />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 24, gap: 16 }}>
        <div style={{ ...card, flex: 1 }}>
          <PaymentBlock d={d} t={t} />
          {d.notes && <div style={{ fontSize: 12, marginTop: 12, opacity: 0.85 }}>{d.notes}</div>}
        </div>
        <Totals d={d} t={t} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 36, color: t.accent, fontWeight: 700, fontSize: 13 }}>
        Thank you for your business.
      </div>
    </div>
  );
}

export const TEMPLATES = {
  classic: Classic,
  sidebar: Sidebar,
  industrial: Industrial,
  friendly: Friendly,
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

export function InvoiceTemplate({
  template,
  data,
  theme,
}: {
  template: TemplateKey;
  data: InvoiceRenderData;
  theme: BrandTheme;
}) {
  const T = TEMPLATES[template] ?? Classic;
  return <T d={data} t={theme} />;
}
