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
import { formatDate } from '@/lib/dates';
import type { LineItem } from '@/lib/ai';

export interface InvoiceRenderData {
  kind: 'invoice' | 'quote';
  invoiceNumber: number;
  businessName: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  slogan?: string | null;
  subject?: string | null;
  rateBasisLabel?: string | null;
  clientName: string;
  clientAddress?: string | null;
  clientPhone?: string | null;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string | null;
  terms?: string | null;
  issuedDate: string;
  dueDate?: string | null;
  paid?: boolean; // drives the Ledger stamp: DUE / QUOTE / PAID
  zelle?: string | null;
  paypalMe?: string | null;
  cashappTag?: string | null;
  venmoUsername?: string | null;
}

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

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

// Payment handles become real tappable links in the final PDF: linked rows carry
// a data-pdf-link attribute that elementToPdf() converts into jsPDF link
// annotations. Zelle stays display-only (no public URL scheme exists).
const cashAppUrl = (tag: string) => `https://cash.app/${tag.startsWith('$') ? tag : `$${tag}`}`;
const payPalUrl = (handle: string) =>
  `https://paypal.me/${handle.replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '').replace(/^[@/]+/, '')}`;
const venmoUrl = (handle: string) => `https://venmo.com/u/${handle.replace(/^@/, '')}`;

// Per-brand colors for the marks, detail text, and instruction icons.
const PAY_COLOR = { cashapp: '#00D632', paypal: '#003087', venmo: '#008CFF', zelle: '#6D1ED4' } as const;
type PayKind = keyof typeof PAY_COLOR;

// Brand glyphs are INLINED (not <img>) — html2canvas fails to rasterize SVG-as-
// <img> (blank/broken marks), and item 2 needs a recolored (white-knockout)
// glyph, which an <img> of a monochrome source cannot do. Inline SVG is the
// html2canvas-reliable path. Paths are the same shapes as public/brands/*.svg
// (Cash App / PayPal / Zelle: Simple Icons; Venmo: Font Awesome Free venmo-v).
const GLYPH: Record<PayKind, { vb: string; d: string }> = {
  cashapp: { vb: '0 0 24 24', d: 'M23.59 3.475a5.1 5.1 0 00-3.05-3.05c-1.31-.42-2.5-.42-4.92-.42H8.36c-2.4 0-3.61 0-4.9.4a5.1 5.1 0 00-3.05 3.06C0 4.765 0 5.965 0 8.365v7.27c0 2.41 0 3.6.4 4.9a5.1 5.1 0 003.05 3.05c1.3.41 2.5.41 4.9.41h7.28c2.41 0 3.61 0 4.9-.4a5.1 5.1 0 003.06-3.06c.41-1.3.41-2.5.41-4.9v-7.25c0-2.41 0-3.61-.41-4.91zm-6.17 4.63l-.93.93a.5.5 0 01-.67.01 5 5 0 00-3.22-1.18c-.97 0-1.94.32-1.94 1.21 0 .9 1.04 1.2 2.24 1.65 2.1.7 3.84 1.58 3.84 3.64 0 2.24-1.74 3.78-4.58 3.95l-.26 1.2a.49.49 0 01-.48.39H9.63l-.09-.01a.5.5 0 01-.38-.59l.28-1.27a6.54 6.54 0 01-2.88-1.57v-.01a.48.48 0 010-.68l1-.97a.49.49 0 01.67 0c.91.86 2.13 1.34 3.39 1.32 1.3 0 2.17-.55 2.17-1.42 0-.87-.88-1.1-2.54-1.72-1.76-.63-3.43-1.52-3.43-3.6 0-2.42 2.01-3.6 4.39-3.71l.25-1.23a.48.48 0 01.48-.38h1.78l.1.01c.26.06.43.31.37.57l-.27 1.37c.9.3 1.75.77 2.48 1.39l.02.02c.19.2.19.5 0 .68z' },
  paypal: { vb: '0 0 24 24', d: 'M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z' },
  venmo: { vb: '48 0 512 512', d: 'M466.5 14.8c17.4 28.7 25.3 58.2 25.3 95.5 0 119-101.9 273.5-184.7 382.1l-188.9 0-75.8-451.5 165.4-15.7 40.1 321.3c37.4-60.8 83.6-156.3 83.6-221.4 0-35.6-6.1-59.9-15.7-79.9L466.5 14.8z' },
  zelle: { vb: '0 0 24 24', d: 'M13.559 24h-2.841a.483.483 0 0 1-.483-.483v-2.765H5.638a.667.667 0 0 1-.666-.666v-2.234a.67.67 0 0 1 .142-.412l8.139-10.382h-7.25a.667.667 0 0 1-.667-.667V3.914c0-.367.299-.666.666-.666h4.23V.483c0-.266.217-.483.483-.483h2.841c.266 0 .483.217.483.483v2.765h4.323c.367 0 .666.299.666.666v2.137a.67.67 0 0 1-.141.41l-8.19 10.481h7.665c.367 0 .666.299.666.666v2.477a.667.667 0 0 1-.666.667h-4.32v2.765a.483.483 0 0 1-.483.483Z' },
};

// Colored rounded square, glyph knocked out in white. Cash App's glyph already
// IS a rounded square with a $ knockout, so it's filled in-brand on a white tile
// (the $ reads white); the others are bare symbols on a brand-filled tile.
function PayMark({ kind }: { kind: PayKind }) {
  const color = PAY_COLOR[kind];
  const S = 32;
  const g = GLYPH[kind];
  if (kind === 'cashapp') {
    return (
      <span style={{ width: S, height: S, borderRadius: 8, background: '#fff', flex: '0 0 auto', display: 'grid', placeItems: 'center' }}>
        <svg width={S} height={S} viewBox={g.vb}><path fill={color} d={g.d} /></svg>
      </span>
    );
  }
  return (
    <span style={{ width: S, height: S, borderRadius: 8, background: color, flex: '0 0 auto', display: 'grid', placeItems: 'center' }}>
      <svg width={Math.round(S * 0.58)} height={Math.round(S * 0.58)} viewBox={g.vb}><path fill="#fff" d={g.d} /></svg>
    </span>
  );
}

// Right-hand instruction icons — inline SVG (Material Symbols is an icon FONT and
// does not rasterize reliably in html2canvas), stroked in the row's brand color.
function InstrIcon({ kind, color }: { kind: 'phone' | 'external' | 'bank'; color: string }) {
  const box: React.CSSProperties = { width: 20, height: 20, flex: '0 0 auto', display: 'block' };
  const s = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'phone')
    return (<svg viewBox="0 0 24 24" style={box}><rect x="6" y="3" width="12" height="18" rx="2.5" {...s} /><line x1="10" y1="18" x2="14" y2="18" {...s} /></svg>);
  if (kind === 'external')
    return (<svg viewBox="0 0 24 24" style={box}><path d="M14 4h6v6" {...s} /><path d="M20 4l-8.5 8.5" {...s} /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" {...s} /></svg>);
  return (<svg viewBox="0 0 24 24" style={box}><path d="M3 9.5l9-5.5 9 5.5" {...s} /><line x1="4" y1="21" x2="20" y2="21" {...s} /><line x1="6.5" y1="10" x2="6.5" y2="18" {...s} /><line x1="10" y1="10" x2="10" y2="18" {...s} /><line x1="14" y1="10" x2="14" y2="18" {...s} /><line x1="17.5" y1="10" x2="17.5" y2="18" {...s} /></svg>);
}

// One bordered rounded CARD per configured method (no table, no horizontal rules).
// A vertical rule (borderLeft) separates the detail column from the instruction
// column. Detail is per-brand colored; linked methods keep the data-pdf-link that
// elementToPdf() turns into a real tappable annotation. Zelle's detail is purple
// but NOT underlined and NOT linked.
function PaymentBlock({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  const rows: { kind: PayKind; method: string; detail: string; url?: string; instruction: string; icon: 'phone' | 'external' | 'bank' }[] = [];
  if (d.cashappTag)
    rows.push({ kind: 'cashapp', method: 'Cash App', detail: `$${d.cashappTag.replace(/^\$/, '')}`, url: cashAppUrl(d.cashappTag), instruction: 'Tap to pay', icon: 'phone' });
  if (d.paypalMe)
    rows.push({ kind: 'paypal', method: 'PayPal', detail: `paypal.me/${d.paypalMe}`, url: payPalUrl(d.paypalMe), instruction: 'Tap to pay', icon: 'external' });
  if (d.venmoUsername)
    rows.push({ kind: 'venmo', method: 'Venmo', detail: `venmo.com/u/${d.venmoUsername.replace(/^@/, '')}`, url: venmoUrl(d.venmoUsername), instruction: 'Tap to pay', icon: 'external' });
  if (d.zelle)
    rows.push({ kind: 'zelle', method: 'Zelle', detail: d.zelle, instruction: 'Send from your bank app', icon: 'bank' });
  if (!rows.length) return null;

  const border = '1px solid #e6e3dd';
  return (
    // Full width: PaymentBlock now gets its own row in every template, so the
    // cards can breathe and the detail never collides with the instruction.
    <div style={{ width: '100%' }}>
      <div style={{ color: '#334155', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 800, fontSize: 15, marginBottom: 10 }}>
        How to pay
      </div>
      {rows.map((r) => {
        const color = PAY_COLOR[r.kind];
        return (
          <div key={r.method} style={{ display: 'flex', alignItems: 'center', gap: 12, border, borderRadius: 12, padding: '8px 14px', marginBottom: 8 }}>
            <PayMark kind={r.kind} />
            <div style={{ flex: '0 0 auto', fontWeight: 800, fontSize: 15, color: t.text }}>{r.method}</div>
            <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {r.url ? (
                <span data-pdf-link={r.url} style={{ color, textDecoration: 'underline' }}>{r.detail}</span>
              ) : (
                <span style={{ color }}>{r.detail}</span>
              )}
            </div>
            <div style={{ flex: '0 0 auto', width: 182, display: 'flex', alignItems: 'center', gap: 8, borderLeft: border, paddingLeft: 14 }}>
              <InstrIcon kind={r.icon} color={color} />
              <span style={{ fontSize: 13, color: t.text, opacity: 0.85, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{r.instruction}</span>
            </div>
          </div>
        );
      })}
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
        <span style={{ fontSize: 26 }}>{money(d.total)}</span>
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
  const hasSpec = d.lineItems.some((li) => Boolean(li.spec));
  const hasUnitQty = d.lineItems.some((li) => li.unit_basis === 'area' || li.unit_basis === 'linear');

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
      <thead>
        <tr style={{ background: t.primary, color: onColor(t.primary) }}>
          <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>ITEM / DESCRIPTION</th>
          {hasSpec && <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>SIZE / DETAIL</th>}
          <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>QTY</th>
          {hasUnitQty && (
            <>
              <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>SQ FT EA</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>SQ FT</th>
            </>
          )}
          <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>RATE</th>
          <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        {d.lineItems.map((li, i) => {
          const uQty = li.unit_qty ?? 1;
          const totalUQty = li.qty * uQty;
          const amt = (li.unit_basis === 'area' || li.unit_basis === 'linear')
            ? li.qty * uQty * li.unit_price
            : li.qty * li.unit_price;

          const prevSection = i > 0 ? d.lineItems[i - 1].section : null;
          const showSectionHeader = Boolean(li.section && li.section !== prevSection);

          const colSpan = 3 + (hasSpec ? 1 : 0) + (hasUnitQty ? 2 : 0);

          return (
            <React.Fragment key={i}>
              {showSectionHeader && (
                <tr style={{ background: `${t.accent}15` }}>
                  <td colSpan={colSpan} style={{ padding: '8px 12px', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: t.primary }}>
                    {li.section}
                  </td>
                </tr>
              )}
              <tr style={{ borderBottom: `1px solid ${t.accent}33` }}>
                <td style={{ padding: '12px' }}>{li.description}</td>
                {hasSpec && <td style={{ padding: '12px', opacity: 0.85 }}>{li.spec || '—'}</td>}
                <td style={{ padding: '12px', textAlign: 'right' }}>{li.qty}</td>
                {hasUnitQty && (
                  <>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{li.unit_qty != null ? li.unit_qty : '—'}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{li.unit_basis === 'area' || li.unit_basis === 'linear' ? totalUQty : '—'}</td>
                  </>
                )}
                <td style={{ padding: '12px', textAlign: 'right' }}>{money(li.unit_price)}</td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{money(amt)}</td>
              </tr>
            </React.Fragment>
          );
        })}
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
    <div><b style={{ color: t.accent }}>Date</b> {formatDate(d.issuedDate)}</div>
    {d.dueDate && <div><b style={{ color: t.accent }}>Due</b> {formatDate(d.dueDate)}</div>}
  </div>
);

// The at-a-glance document-type marker. INVOICE prints as a SOLID accent block;
// QUOTE as an OUTLINED one with a plain-language subline. Fill-vs-outline reads
// instantly and doesn't depend on the user's brand colors being far apart, so a
// quote can never be mistaken for a bill. Shared by Classic / Industrial /
// Friendly; Ledger keeps its own rotated stamp.
function DocTypeMark({ d, t, align = 'left', size = 22 }: {
  d: InvoiceRenderData; t: BrandTheme; align?: 'left' | 'center' | 'right'; size?: number;
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
    <div style={{ ...PAGE, background: t.background, color: t.text, padding: 56, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        {/* Top Header Single Horizontal Band */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {d.logoUrl && <img src={d.logoUrl} style={{ height: 64, objectFit: 'contain' }} alt="" />}
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: MONTSERRAT, color: t.primary === t.background ? t.text : t.primary }}>
                {d.businessName}
              </div>
              {d.slogan && <div style={{ color: t.accent, fontStyle: 'italic', fontSize: 13 }}>{d.slogan}</div>}
              <Website url={d.websiteUrl} t={t} style={{ fontSize: 12 }} />
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <DocTypeMark d={d} t={t} align="right" size={20} />
            <Meta d={d} t={t} />
          </div>
        </div>

        <div style={{ height: 2, background: t.accent, margin: '20px 0' }} />

        {/* Subject & Rate-basis badge */}
        {(d.subject || d.rateBasisLabel) && (
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            {d.subject && <div style={{ fontSize: 16, fontWeight: 800, color: t.primary }}>{d.subject}</div>}
            {d.rateBasisLabel && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 4, background: t.accent, color: onColor(t.accent) }}>
                {d.rateBasisLabel}
              </span>
            )}
          </div>
        )}

        <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 24 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: t.accent, fontWeight: 700 }}>
            {d.kind === 'quote' ? 'PREPARED FOR' : 'BILLED TO'}
          </div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{d.clientName}</div>
          {d.clientAddress && <div>{d.clientAddress}</div>}
          {d.clientPhone && <div>{d.clientPhone}</div>}
        </div>

        <ItemsTable d={d} t={t} />
      </div>

      {/* Bottom Anchored Slack Area */}
      <div style={{ marginTop: 'auto', paddingTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <Totals d={d} t={t} />
        </div>

        <PaymentBlock d={d} t={t} />

        {d.terms && (
          <div style={{ marginTop: 16, fontSize: 11, color: t.text, opacity: 0.8, borderTop: `1px solid ${t.accent}33`, paddingTop: 8 }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>TERMS: </span>
            {d.terms}
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: t.accent }}>
          Thank you for your business.
        </div>
        <Branding t={t} />
      </div>
    </div>
  );
}

/* ── 2. LEDGER (DB key 'sidebar') ───────────────────────────── */
/* Old-school carbon-copy invoice book: ruled horizontal lines, slab-serif
   business name, monospace numerals right-aligned in a ruled table, and a
   rotated stamp-style DUE / QUOTE / PAID badge in the accent color.       */
// Georgia is deliberately NOT in this stack: it defaults to OLDSTYLE figures
// (varying-height digits with descenders), and html2canvas rasterizes text with
// the font's default figures — it does NOT honor font-variant-numeric /
// font-feature-settings (verified in the harness). Rockwell / Roboto Slab /
// Times all default to LINING figures, so any digit that lands in slab-stack
// text (descriptions, names) reads correctly. All dedicated numeral fields use
// MONO (Courier), which is lining + tabular by default.
const SLAB = "Rockwell, 'Roboto Slab', 'Times New Roman', Times, serif";
const MONO = "'Courier New', Courier, monospace";

// Ledger-only vertical payment rail. Deliberately does NOT touch or reuse the
// shared PaymentBlock, so Classic / Industrial / Friendly are unaffected. Methods
// stack with whitespace only — no cards, no borders, no dividers. Brand marks
// keep their fixed brand colors (PayMark). Rendered by the caller for INVOICES
// ONLY; quotes get no rail.
//
// STRIPE-READY: the rail is a data-driven vertical list, so any subset of methods
// renders, a single method still reads as an intentional entry, and up to five
// fit without crowding. When Stripe Connect ships it becomes one more entry here
// — a data change, not a layout change:
//   if (d.stripePaymentLink)
//     rows.push({ kind: 'stripe', method: 'Stripe', detail: 'Pay online',
//                 url: d.stripePaymentLink, instruction: 'Tap to pay' });
// (kind 'stripe' would then gain a PAY_COLOR '#635BFF' + GLYPH entry.)
function LedgerPaymentRail({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  const rows: { kind: PayKind; method: string; detail: string; url?: string; instruction: string }[] = [];
  if (d.cashappTag)
    rows.push({ kind: 'cashapp', method: 'Cash App', detail: `$${d.cashappTag.replace(/^\$/, '')}`, url: cashAppUrl(d.cashappTag), instruction: 'Tap to pay' });
  if (d.paypalMe)
    rows.push({ kind: 'paypal', method: 'PayPal', detail: `paypal.me/${d.paypalMe}`, url: payPalUrl(d.paypalMe), instruction: 'Tap to pay' });
  if (d.venmoUsername)
    rows.push({ kind: 'venmo', method: 'Venmo', detail: `venmo.com/u/${d.venmoUsername.replace(/^@/, '')}`, url: venmoUrl(d.venmoUsername), instruction: 'Tap to pay' });
  // Zelle is display-only: no url → no data-pdf-link → we attach NO annotation
  // to this row (verified: the generated PDF carries link annotations only for
  // the URL-backed methods above, none over Zelle). If someone reports the Zelle
  // number as "tappable" in a viewer, that is viewer-side Live Text / image text
  // recognition acting on the RASTERIZED number (the page is a flattened image),
  // offering call/copy — never a payment. It is not ours and can't be suppressed
  // from PDF content; do not re-investigate as an annotation bug.
  if (d.zelle)
    rows.push({ kind: 'zelle', method: 'Zelle', detail: d.zelle, instruction: 'Send from your bank app' });
  if (!rows.length) return null;

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: t.accent }}>
        Payment methods
      </div>
      <div style={{ borderBottom: `1px solid ${t.accent}`, marginTop: 8, marginBottom: 18 }} />
      {rows.map((r) => (
        // The WHOLE ROW is the tap target: data-pdf-link on the row container, so
        // elementToPdf() lays the jsPDF annotation over the container's full
        // bounds (mark + name + handle + instruction). Zelle has no url, so the
        // attribute is omitted and no annotation is created for it.
        <div key={r.method} data-pdf-link={r.url}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 18 }}>
          <PayMark kind={r.kind} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: t.text }}>{r.method}</div>
            <div style={{ fontSize: 13, color: t.text, wordBreak: 'break-all', marginTop: 2, fontFamily: MONO }}>{r.detail}</div>
            <div style={{ fontSize: 12, color: t.accent, marginTop: 2 }}>{r.instruction}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Ledger({ d, t }: { d: InvoiceRenderData; t: BrandTheme }) {
  const isInvoice = d.kind === 'invoice';
  const rule = `1px solid ${t.accent}`;
  const eyebrow: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: t.accent };
  // Business name / display word use primary unless it equals the background.
  const ink = t.primary === t.background ? t.text : t.primary;

  // LEFT column. flex:1 alone (quote) fills the full width — no dead space.
  const left = (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      <div style={eyebrow}>{isInvoice ? 'Billed to' : 'Prepared for'}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{d.clientName}</div>
      {d.clientAddress && <div style={{ fontSize: 13, marginTop: 4 }}>{d.clientAddress}</div>}
      {d.clientPhone && <div style={{ fontSize: 13 }}>{d.clientPhone}</div>}

      {/* AMOUNT DUE band — the focal point. Solid accent fill; text via onColor
          so it stays legible on both light (gold) and dark (navy) accents. */}
      <div style={{ background: t.accent, color: onColor(t.accent), padding: '20px 24px', marginTop: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          {isInvoice ? 'Amount due' : 'Quoted total'}
        </div>
        <div style={{ fontSize: 50, fontWeight: 800, lineHeight: 1.05, marginTop: 4, fontFamily: MONO }}>{money(d.total)}</div>
      </div>

      {/* Line items — no header fill, no gridlines; thin rule under labels only. */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, marginTop: 28 }}>
        <thead>
          <tr>
            {['Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
              <th key={h} style={{ ...eyebrow, textAlign: i === 0 ? 'left' : 'right', padding: '0 4px 8px', borderBottom: rule }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.lineItems.map((li, i) => (
            <tr key={i}>
              <td style={{ padding: '10px 4px' }}>{li.description}</td>
              <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: MONO }}>{li.qty}</td>
              <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: MONO }}>{money(li.unit_price)}</td>
              <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: MONO, fontWeight: 700 }}>{money(li.qty * li.unit_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Subtotal + TOTAL DUE — thin rule above the totals only. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <div style={{ width: 280, borderTop: rule, paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '2px 4px' }}>
            <span>Subtotal</span><span style={{ fontFamily: MONO }}>{money(d.subtotal)}</span>
          </div>
          {d.taxRate > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '2px 4px' }}>
              <span>Tax ({d.taxRate}%)</span><span style={{ fontFamily: MONO }}>{money(d.taxAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', fontWeight: 800 }}>
            <span style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>{isInvoice ? 'Total due' : 'Quoted'}</span>
            <span style={{ fontSize: 20, color: t.accent, fontFamily: MONO }}>{money(d.total)}</span>
          </div>
        </div>
      </div>

      {/* Notes kept (user content) — spec didn't list it; placed subtly here. */}
      {d.notes && <div style={{ fontSize: 13, marginTop: 24, maxWidth: 440 }}>{d.notes}</div>}

      <div style={{ fontSize: 13, marginTop: 28, color: t.accent }}>
        {isInvoice ? 'Thank you for your business.' : 'This estimate is valid for 30 days.'}
      </div>
    </div>
  );

  return (
    <div style={{ ...PAGE, background: t.background, color: t.text, padding: 64, fontFamily: SLAB, fontVariantNumeric: 'lining-nums tabular-nums' }}>
      {/* ── Header (full width): identity left, document marker right ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ minWidth: 0 }}>
          {d.logoUrl && <img src={d.logoUrl} style={{ height: 96, marginBottom: 10, display: 'block' }} alt="" />}
          <div style={{ fontSize: d.logoUrl ? 28 : 34, fontWeight: 900, lineHeight: 1.05, letterSpacing: 0.5, color: ink }}>{d.businessName}</div>
          {d.slogan && <div style={{ color: t.accent, fontSize: 14, marginTop: 4 }}>{d.slogan}</div>}
          <Website url={d.websiteUrl} t={t} style={{ fontSize: 13, marginTop: 2 }} />
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', color: ink, fontFamily: SLAB }}>{docNoun(d.kind)}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.accent, marginTop: 2, fontFamily: MONO }}>{formatDocNumber(d.kind, d.invoiceNumber)}</div>
          <div style={{ fontSize: 12, marginTop: 8 }}><span style={eyebrow}>Issued</span>&nbsp; <span style={{ fontFamily: MONO }}>{formatDate(d.issuedDate)}</span></div>
          {d.dueDate && <div style={{ fontSize: 12, marginTop: 2 }}><span style={eyebrow}>Due</span>&nbsp; <span style={{ fontFamily: MONO }}>{formatDate(d.dueDate)}</span></div>}
        </div>
      </div>

      <div style={{ borderBottom: rule, margin: '24px 0 28px' }} />

      {/* ── Body: two columns on an invoice, full-width left on a quote ── */}
      <div style={{ display: 'flex', gap: isInvoice ? 36 : 0 }}>
        {left}
        {isInvoice && (
          <div style={{ flex: '0 0 200px', minWidth: 0, borderLeft: rule, paddingLeft: 28 }}>
            <LedgerPaymentRail d={d} t={t} />
          </div>
        )}
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
          {formatDocNumber(d.kind, d.invoiceNumber)}&nbsp;&nbsp;·&nbsp;&nbsp;{formatDate(d.issuedDate)}{d.dueDate ? `  ·  DUE ${formatDate(d.dueDate)}` : ''}
        </span>
      </div>
      <div style={{ padding: '36px 56px' }}>
        <div style={{ marginBottom: 28, fontSize: 13, lineHeight: 1.8 }}>
          <span style={{ color: t.accent, fontWeight: 800, textTransform: 'uppercase', fontSize: 11, letterSpacing: 2 }}>
            Billed to&nbsp;&nbsp;
          </span>
          <span style={{ fontWeight: 800, fontSize: 19 }}>{d.clientName}</span>
          {d.clientAddress && <div style={{ opacity: 0.8 }}>{d.clientAddress}</div>}
          {d.clientPhone && <div style={{ opacity: 0.8 }}>{d.clientPhone}</div>}
        </div>
        <ItemsTable d={d} t={t} />
        {/* Option A: Totals stays where it is (right, after the items table);
            PaymentBlock moves to its own full-width row below. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28 }}>
          <Totals d={d} t={t} />
        </div>
        <div style={{ marginTop: 28 }}>
          <PaymentBlock d={d} t={t} />
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
          <div style={{ fontWeight: 700, fontSize: 18 }}>{d.clientName}</div>
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
      {/* Option A + F2: PaymentBlock on its own full-width row. Notes moves OUT of
          the (now-purposeless) decorative card to sit beside Totals with its exact
          text styling — only the wrapper is gone. justifyContent is conditional so
          that with no notes, Totals sits alone on the right and nothing empty
          renders (the notes element is simply absent). */}
      <div style={{ marginTop: 24 }}>
        <PaymentBlock d={d} t={t} />
      </div>
      <div style={{ display: 'flex', justifyContent: d.notes ? 'space-between' : 'flex-end', alignItems: 'flex-start', marginTop: 24, gap: 16 }}>
        {d.notes && <div style={{ fontSize: 12, marginTop: 12, opacity: 0.85 }}>{d.notes}</div>}
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
