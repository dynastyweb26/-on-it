/* ═══ ON IT — The 4 invoice templates ═══
   Rendered as HTML at 794×1123px (A4 @ 96dpi), captured by html2canvas → jsPDF.
   Each template is a genuinely different LAYOUT, not a reskin:

   1. classic    — centered header, ruled table. The safe professional default.
   2. ledger     — old-school carbon-copy invoice book: ruled lines, slab type,
                   monospace numerals, rotated DUE/QUOTE/PAID stamp.
                   (DB key stays 'sidebar' — display label is 'Ledger'.)
   3. industrial — full-bleed dark-style header block, heavy type, hard edges.
                   (Cyril's black/red invoice energy lives here.)
   4. friendly   — rounded cards, soft spacing, approachable. Built from scratch.

   Color roles come from buildTheme(): background (user-chosen), text
   (white on dark / black on light), primary (headers), accent (totals,
   website, slogan, dividers).                                              */

import React from 'react';
import { BrandTheme, onColor } from '@/lib/colors';
import { websiteHref } from '@/lib/url';
import { docNoun, formatDocNumber } from '@/lib/documents';
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
  clientPhone?: string | null;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string | null;
  issuedDate: string;
  dueDate?: string | null;
  paid?: boolean; // drives the Ledger stamp: DUE / QUOTE / PAID
  zelle?: string | null;
  paypalMe?: string | null;
  cashappTag?: string | null;
  venmoUsername?: string | null;
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// No-logo fallback: when the user has no logo, the business NAME is promoted
// to display size so the header looks intentional, never missing. Montserrat
// 800 (loaded app-wide via next/font, so available to the html2canvas capture)
// for Classic / Industrial / Friendly; Ledger keeps its slab face — per-template
// identity wins, consistent with the design standard's own PDF exemption.
const MONTSERRAT = "var(--font-montserrat), 'Helvetica Neue', Arial, sans-serif";

const PAGE: React.CSSProperties = {
  width: 794,
  minHeight: 1123,
  boxSizing: 'border-box',
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  position: 'relative',
};

// Payment handles become real tappable links in the final PDF: rows carry a
// data-pdf-link attribute that elementToPdf() converts into jsPDF link
// annotations. Zelle stays display-only (no public URL scheme exists).
const cashAppUrl = (tag: string) => `https://cash.app/${tag.startsWith('$') ? tag : `$${tag}`}`;
const payPalUrl = (handle: string) =>
  `https://paypal.me/${handle.replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '').replace(/^[@/]+/, '')}`;

function PaymentBlock({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  // METHOD | DETAIL | TIP. DETAIL is the tappable element for methods with a
  // public URL (Cash App, PayPal): rendered in the accent color + underlined
  // so it reads as a link, and carrying data-pdf-link so elementToPdf() lays a
  // real jsPDF link annotation over it. Zelle has no shareable web link, so its
  // detail is plain text and the tip explains to pay via the bank app.
  const rows: { method: string; detail: string; url?: string; tip: string }[] = [];
  if (d.zelle)
    rows.push({ method: 'Zelle', detail: d.zelle, tip: 'Send in your bank app to this number' });
  if (d.cashappTag)
    rows.push({ method: 'Cash App', detail: d.cashappTag, url: cashAppUrl(d.cashappTag), tip: 'Tap to pay' });
  if (d.paypalMe)
    rows.push({ method: 'PayPal', detail: `paypal.me/${d.paypalMe}`, url: payPalUrl(d.paypalMe), tip: 'Tap to pay' });
  if (!rows.length) return null;

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '6px 12px 6px 0',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: t.accent,
    fontWeight: 700,
    borderBottom: `1.5px solid ${t.accent}`,
  };
  const td: React.CSSProperties = { padding: '8px 12px 8px 0', verticalAlign: 'top' };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, marginBottom: 6 }}>
        How to pay
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={th}>Method</th>
            <th style={th}>Detail</th>
            <th style={th}>Tip</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.method} style={{ borderBottom: `1px solid ${t.accent}33` }}>
              <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.method}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                {r.url ? (
                  <span data-pdf-link={r.url} style={{ color: t.accent, textDecoration: 'underline', fontWeight: 600 }}>
                    {r.detail}
                  </span>
                ) : (
                  <span>{r.detail}</span>
                )}
              </td>
              <td style={{ ...td, paddingRight: 0, opacity: 0.75, maxWidth: 150 }}>{r.tip}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

/* Ambient marketing: prints subtly on every real invoice (item locked). */
const Branding = ({ t }: { t: BrandTheme }) => (
  <div
    style={{
      position: 'absolute', bottom: 14, left: 0, right: 0,
      textAlign: 'center', fontSize: 10, letterSpacing: 1.5,
      color: t.accent, opacity: 0.65,
    }}
  >
    Generated by On It
  </div>
);

const Meta = ({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) => (
  <div style={{ fontSize: 13, lineHeight: 1.8 }}>
    <div>
      <b style={{ color: t.accent }}>{docNoun(d.kind)}</b> {formatDocNumber(d.kind, d.invoiceNumber)}
    </div>
    <div><b style={{ color: t.accent }}>Date</b> {d.issuedDate}</div>
    {d.dueDate && <div><b style={{ color: t.accent }}>Due</b> {d.dueDate}</div>}
  </div>
);

// The at-a-glance document-type marker. INVOICE prints as a SOLID accent block;
// QUOTE as an OUTLINED one with a plain-language subline. Fill-vs-outline reads
// instantly and doesn't depend on the user's brand colors being far apart, so a
// quote can never be mistaken for a bill. Shared by Classic / Industrial /
// Friendly; Ledger keeps its own rotated stamp.
function DocTypeMark({ d, t, align = 'left', size = 22 }: {
  d: InvoiceRenderData; t: BrandTheme; align?: 'left' | 'center'; size?: number;
}) {
  const isQuote = d.kind === 'quote';
  return (
    <div style={{ textAlign: align }}>
      <div
        style={{
          display: 'inline-block',
          padding: '6px 20px',
          fontFamily: MONTSERRAT,
          fontWeight: 800,
          fontSize: size,
          letterSpacing: 5,
          textTransform: 'uppercase',
          border: `2px solid ${t.accent}`,
          borderRadius: 4,
          background: isQuote ? 'transparent' : t.accent,
          color: isQuote ? t.accent : onColor(t.accent),
        }}
      >
        {docNoun(d.kind)}
      </div>
      {isQuote && (
        <div style={{ marginTop: 5, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: t.accent, fontWeight: 700 }}>
          Estimate — not a bill
        </div>
      )}
    </div>
  );
}

// Website: display the raw value the user typed, but make it a real link whose
// href is normalized (bare domains get https://). data-pdf-link → tappable in
// the generated PDF (elementToPdf); href → clickable in the on-screen preview.
// Returns null when there's no usable value, so callers don't render an empty line.
const Website = ({ url, t, style }: { url?: string | null; t: BrandTheme; style?: React.CSSProperties }) => {
  const href = websiteHref(url);
  if (!href) return null;
  return (
    <a
      href={href}
      data-pdf-link={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'block', color: t.accent, textDecoration: 'none', ...style }}
    >
      {url}
    </a>
  );
};

/* ── 1. CLASSIC ─────────────────────────────────────────────── */
function Classic({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  return (
    <div style={{ ...PAGE, background: t.background, color: t.text, padding: 56 }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        {d.logoUrl && <img src={d.logoUrl} style={{ height: 128, marginBottom: 12 }} alt="" />}
        <div
          style={{
            fontSize: d.logoUrl ? 30 : 42,
            fontWeight: 800,
            color: t.primary === t.background ? t.text : t.primary,
            ...(d.logoUrl ? {} : { fontFamily: MONTSERRAT, letterSpacing: -0.5, marginBottom: 4 }),
          }}
        >
          {d.businessName}
        </div>
        {d.slogan && <div style={{ color: t.accent, fontStyle: 'italic', fontSize: 14 }}>{d.slogan}</div>}
        <Website url={d.websiteUrl} t={t} style={{ fontSize: 13 }} />
      </div>
      <div style={{ height: 3, background: t.accent, margin: '24px 0' }} />
      <DocTypeMark d={d} t={t} align="center" size={24} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, marginBottom: 32 }}>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: t.accent, fontWeight: 700 }}>
            {d.kind === 'quote' ? 'Prepared for' : 'Billed to'}
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{d.clientName}</div>
          {d.clientAddress && <div>{d.clientAddress}</div>}
          {d.clientPhone && <div>{d.clientPhone}</div>}
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
      <Branding t={t} />
    </div>
  );
}

/* ── 2. LEDGER (DB key 'sidebar') ───────────────────────────── */
/* Old-school carbon-copy invoice book: ruled horizontal lines, slab-serif
   business name, monospace numerals right-aligned in a ruled table, and a
   rotated stamp-style DUE / QUOTE / PAID badge in the accent color.       */
const SLAB = "Rockwell, 'Roboto Slab', Georgia, 'Times New Roman', serif";
const MONO = "'Courier New', Courier, monospace";

function Ledger({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  const stamp = d.kind === 'quote' ? 'QUOTE' : d.paid ? 'PAID' : 'DUE';
  const rule = `1.5px solid ${t.accent}`;
  const faintRule = `1px solid ${t.accent}66`;
  const label: React.CSSProperties = {
    fontFamily: SLAB, fontSize: 11, textTransform: 'uppercase',
    letterSpacing: 2, color: t.accent, fontWeight: 700,
  };
  return (
    <div style={{ ...PAGE, background: t.background, color: t.text, padding: '72px 64px', fontFamily: SLAB }}>
      {/* stamp badge */}
      <div
        style={{
          position: 'absolute', top: 84, right: 64,
          transform: 'rotate(-12deg)',
          border: `4px double ${t.accent}`, color: t.accent,
          padding: '10px 26px', fontFamily: SLAB, fontWeight: 900,
          fontSize: 30, letterSpacing: 6, textTransform: 'uppercase',
          opacity: 0.9,
        }}
      >
        {stamp}
      </div>

      {/* header — business name top-left, slab type */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
        {d.logoUrl && <img src={d.logoUrl} style={{ height: 128 }} alt="" />}
        <div>
          {/* Ledger fallback keeps the slab face — only the size is promoted */}
          <div style={{ fontSize: d.logoUrl ? 36 : 48, fontWeight: 900, lineHeight: 1.1, letterSpacing: 0.5, color: t.primary === t.background ? t.text : t.primary }}>
            {d.businessName}
          </div>
          {d.slogan && <div style={{ color: t.accent, fontSize: 14, marginTop: 4 }}>{d.slogan}</div>}
          <Website url={d.websiteUrl} t={t} style={{ fontSize: 13, marginTop: 2 }} />
        </div>
      </div>

      <div style={{ borderBottom: rule, margin: '28px 0 24px' }} />

      {/* meta — filled-in ledger lines */}
      <div style={{ display: 'flex', gap: 40, marginBottom: 28, fontSize: 14 }}>
        <div>
          <span style={label}>No.&nbsp;</span>
          <span style={{ fontFamily: MONO, fontWeight: 700 }}>
            {formatDocNumber(d.kind, d.invoiceNumber)}
          </span>
        </div>
        <div>
          <span style={label}>Date&nbsp;</span>
          <span style={{ fontFamily: MONO }}>{d.issuedDate}</span>
        </div>
        {d.dueDate && (
          <div>
            <span style={label}>Due&nbsp;</span>
            <span style={{ fontFamily: MONO }}>{d.dueDate}</span>
          </div>
        )}
      </div>
      <div style={{ marginBottom: 32, fontSize: 16, borderBottom: faintRule, paddingBottom: 10 }}>
        <span style={label}>Billed to&nbsp;&nbsp;</span>
        <span style={{ fontWeight: 700 }}>{d.clientName}</span>
        {d.clientAddress && <div style={{ opacity: 0.8, fontSize: 13, marginTop: 4 }}>{d.clientAddress}</div>}
        {d.clientPhone && <div style={{ opacity: 0.8, fontSize: 13 }}>{d.clientPhone}</div>}
      </div>

      {/* ruled items table — monospace numerals right-aligned */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {['Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
              <th key={h} style={{ ...label, textAlign: i === 0 ? 'left' : 'right', padding: '8px 4px', borderBottom: rule }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.lineItems.map((li, i) => (
            <tr key={i}>
              <td style={{ padding: '12px 4px', borderBottom: faintRule }}>{li.description}</td>
              <td style={{ padding: '12px 4px', borderBottom: faintRule, textAlign: 'right', fontFamily: MONO }}>{li.qty}</td>
              <td style={{ padding: '12px 4px', borderBottom: faintRule, textAlign: 'right', fontFamily: MONO }}>{money(li.unit_price)}</td>
              <td style={{ padding: '12px 4px', borderBottom: faintRule, textAlign: 'right', fontFamily: MONO, fontWeight: 700 }}>
                {money(li.qty * li.unit_price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* totals — ledger style, double-ruled total */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <div style={{ width: 280, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px' }}>
            <span>Subtotal</span>
            <span style={{ fontFamily: MONO }}>{money(d.subtotal)}</span>
          </div>
          {d.taxRate > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px' }}>
              <span>Tax ({d.taxRate}%)</span>
              <span style={{ fontFamily: MONO }}>{money(d.taxAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 4px', marginTop: 6, borderTop: `4px double ${t.accent}`, fontWeight: 900, fontSize: 19 }}>
            <span style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              {d.kind === 'quote' ? 'Quoted' : 'Total due'}
            </span>
            <span style={{ fontFamily: MONO, color: t.accent }}>{money(d.total)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 48 }}>
        <PaymentBlock d={d} t={t} />
        {d.notes && <div style={{ fontSize: 12, maxWidth: 300, opacity: 0.85 }}>{d.notes}</div>}
      </div>
      <Branding t={t} />
    </div>
  );
}

/* ── 3. INDUSTRIAL ──────────────────────────────────────────── */
function Industrial({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  const isQuote = d.kind === 'quote';
  return (
    <div style={{ ...PAGE, background: t.background, color: t.text }}>
      <div style={{ background: t.primary, color: onColor(t.primary), padding: '40px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div
            style={{
              fontSize: d.logoUrl ? 34 : 44,
              fontWeight: d.logoUrl ? 900 : 800, // Montserrat loads 700/800 only
              textTransform: 'uppercase',
              letterSpacing: 1,
              ...(d.logoUrl ? {} : { fontFamily: MONTSERRAT }),
            }}
          >
            {d.businessName}
          </div>
          {d.slogan && <div style={{ color: t.accent, fontWeight: 700, fontSize: 14 }}>{d.slogan}</div>}
          <Website url={d.websiteUrl} t={t} style={{ fontSize: 13, marginTop: 4 }} />
        </div>
        {d.logoUrl && <img src={d.logoUrl} style={{ height: 140 }} alt="" />}
      </div>
      {/* Type bar: SOLID accent for an invoice, OUTLINED for a quote — the block
          treatment itself signals which document this is, before the words. */}
      <div style={{
        background: isQuote ? t.background : t.accent,
        color: isQuote ? t.accent : onColor(t.accent),
        border: isQuote ? `3px solid ${t.accent}` : 'none',
        padding: isQuote ? '9px 53px' : '12px 56px',
        fontWeight: 800, textTransform: 'uppercase', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 22, letterSpacing: 6 }}>{docNoun(d.kind)}</span>
        <span style={{ fontSize: 14, letterSpacing: 3 }}>
          {formatDocNumber(d.kind, d.invoiceNumber)}&nbsp;&nbsp;·&nbsp;&nbsp;{d.issuedDate}{d.dueDate ? `  ·  DUE ${d.dueDate}` : ''}
        </span>
      </div>
      <div style={{ padding: '36px 56px' }}>
        <div style={{ marginBottom: 28, fontSize: 13, lineHeight: 1.8 }}>
          <span style={{ color: t.accent, fontWeight: 800, textTransform: 'uppercase', fontSize: 11, letterSpacing: 2 }}>
            Billed to&nbsp;&nbsp;
          </span>
          <span style={{ fontWeight: 800, fontSize: 17 }}>{d.clientName}</span>
          {d.clientAddress && <div style={{ opacity: 0.8 }}>{d.clientAddress}</div>}
          {d.clientPhone && <div style={{ opacity: 0.8 }}>{d.clientPhone}</div>}
        </div>
        <ItemsTable d={d} t={t} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28 }}>
          <PaymentBlock d={d} t={t} />
          <Totals d={d} t={t} />
        </div>
        {d.notes && <div style={{ fontSize: 12, marginTop: 32, borderLeft: `4px solid ${t.accent}`, paddingLeft: 12, opacity: 0.9 }}>{d.notes}</div>}
      </div>
      <Branding t={t} />
    </div>
  );
}

/* ── 4. FRIENDLY ────────────────────────────────────────────── */
function Friendly({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  const isQuote = d.kind === 'quote';
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
          <img src={d.logoUrl} style={{ height: 128, width: 128, borderRadius: 20, objectFit: 'cover' }} alt="" />
        )}
        <div>
          <div
            style={{
              fontSize: d.logoUrl ? 26 : 36,
              fontWeight: 800,
              color: t.primary === t.background ? t.text : t.primary,
              ...(d.logoUrl ? {} : { fontFamily: MONTSERRAT }),
            }}
          >
            {d.businessName}
          </div>
          {d.slogan && <div style={{ color: t.accent, fontSize: 13 }}>{d.slogan}</div>}
          <Website url={d.websiteUrl} t={t} style={{ fontSize: 12 }} />
        </div>
        {/* Pill: SOLID for an invoice, OUTLINED for a quote — same fill/outline
            cue as the other templates, in Friendly's rounded voice. */}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{
            display: 'inline-block',
            background: isQuote ? 'transparent' : t.accent,
            color: isQuote ? t.accent : onColor(t.accent),
            border: `2px solid ${t.accent}`,
            borderRadius: 999, padding: '8px 20px', fontWeight: 800, fontSize: 15,
            textTransform: 'uppercase', letterSpacing: 1,
          }}>
            {docNoun(d.kind)} {formatDocNumber(d.kind, d.invoiceNumber)}
          </div>
          {isQuote && (
            <div style={{ marginTop: 5, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: t.accent, fontWeight: 700 }}>
              Estimate — not a bill
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{ ...card, flex: 1 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: t.accent, fontWeight: 700, marginBottom: 6 }}>
            For
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{d.clientName}</div>
          {d.clientAddress && <div style={{ fontSize: 13 }}>{d.clientAddress}</div>}
          {d.clientPhone && <div style={{ fontSize: 13 }}>{d.clientPhone}</div>}
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
      <Branding t={t} />
    </div>
  );
}

export const TEMPLATES = {
  classic: Classic,
  sidebar: Ledger, // DB key kept stable; the design + label are 'Ledger'
  industrial: Industrial,
  friendly: Friendly,
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

/** Display names — the 'sidebar' key renders and reads as 'Ledger'. */
export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  classic: 'Classic',
  sidebar: 'Ledger',
  industrial: 'Industrial',
  friendly: 'Friendly',
};

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
