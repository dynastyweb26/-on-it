/* ═══ ON IT — Expense Summary document ═══
   Rendered as HTML at 794px wide (A4 @ 96dpi), captured by html2canvas → jsPDF
   through the SAME pipeline as invoices (elementToPdf).

   Non-negotiable: WHITE background, BLACK text. This is a records document, not
   a branded invoice. The user's brand accent (already darkened for white paper
   by accentForWhite) appears in EXACTLY three places:
     1. the rule line under the business-name header
     2. the total row
     3. the thin separator lines between category rows
   Nothing else is colored. */
import React from 'react';

export interface SummaryRowData {
  label: string;
  count: number;
  total: number;
  anyDeductible: boolean;
}

export interface ExpenseSummaryData {
  businessName: string;
  logoUrl?: string | null;
  periodLabel: string;   // "2026", "July 2026", …
  rangeStart: string;    // display date "Jan 1, 2026"
  rangeEnd: string;      // display date "Dec 31, 2026"
  generatedOn: string;   // display date
  rows: SummaryRowData[];
  total: number;
  count: number;
}

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';
const MONTSERRAT = "var(--font-montserrat), 'Helvetica Neue', Arial, sans-serif";
const INK = '#111111';       // black text (non-negotiable)
const MUTED = '#555555';     // secondary lines (dates, disclaimer)

const DISCLAIMER =
  'This is a record of expenses you logged in On It, grouped by category. It is not tax advice. Whether an expense is deductible is determined by your tax professional.';

const PAGE: React.CSSProperties = {
  width: 794,
  minHeight: 1123,
  boxSizing: 'border-box',
  background: '#ffffff',
  color: INK,
  padding: 56,
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  position: 'relative',
};

export function ExpenseSummaryTemplate({ d, accent }: { d: ExpenseSummaryData; accent: string }) {
  return (
    <div style={PAGE}>
      {/* Header — business name (same no-logo fallback as invoices: name
          promoted to display size when there's no logo). Black, never accent. */}
      <div style={{ textAlign: 'center' }}>
        {d.logoUrl && <img src={d.logoUrl} style={{ height: 84, marginBottom: 12 }} alt="" />}
        <div
          style={{
            fontSize: d.logoUrl ? 28 : 40,
            fontWeight: 800,
            color: INK,
            ...(d.logoUrl ? {} : { fontFamily: MONTSERRAT, letterSpacing: -0.5 }),
          }}
        >
          {d.businessName}
        </div>
      </div>

      {/* (1) accent rule line under the header */}
      <div style={{ height: 3, background: accent, margin: '20px 0 28px' }} />

      {/* Title + period + generated date */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: MONTSERRAT, color: INK }}>
          Expense Summary — {d.periodLabel}
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>
          Period covered: {d.rangeStart} – {d.rangeEnd}
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
          Generated {d.generatedOn}
        </div>
      </div>

      {/* Category table — category / count / total, thin accent separators */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: MUTED, fontWeight: 700 }}>
              Category
            </th>
            <th style={{ textAlign: 'right', padding: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: MUTED, fontWeight: 700, width: 90 }}>
              Count
            </th>
            <th style={{ textAlign: 'right', padding: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: MUTED, fontWeight: 700, width: 150 }}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${accent}59` /* (3) thin separators */ }}>
              <td style={{ padding: '12px 0', color: INK }}>
                {r.label}
              </td>
              <td style={{ padding: '12px 0', textAlign: 'right', color: INK }}>{r.count}</td>
              <td style={{ padding: '12px 0', textAlign: 'right', color: INK, fontWeight: 600 }}>{money(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* (2) total row — accent framed, still black text on white */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 8,
          padding: '14px 0',
          borderTop: `2.5px solid ${accent}`,
          borderBottom: `2.5px solid ${accent}`,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, color: INK }}>
          Total spend · {d.count} {d.count === 1 ? 'expense' : 'expenses'}
        </span>
        <span style={{ fontSize: 26, fontWeight: 800, fontFamily: MONTSERRAT, color: INK }}>
          {money(d.total)}
        </span>
      </div>

      {/* Disclaimer footer — plain language, no legalese */}
      <div style={{ position: 'absolute', left: 56, right: 56, bottom: 44 }}>
        <div style={{ height: 1, background: '#e0e0e0', marginBottom: 12 }} />
        <p style={{ fontSize: 11, lineHeight: 1.6, color: MUTED, margin: 0 }}>{DISCLAIMER}</p>
        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 10, letterSpacing: 1.5, color: MUTED, opacity: 0.8 }}>
          Generated by On It
        </div>
      </div>
    </div>
  );
}

export { DISCLAIMER };

/* ═══ Income Summary document ═══
   Same rules as the Expense Summary: white paper, black text, the brand accent
   only on the header rule, the thin separators (here: between client groups)
   and the total row.

   Everything is ONE table (client header row → that client's payment rows →
   client subtotal row), so elementToPdf's multi-page partitioner can split a
   long list across pages with the column header repeated. It relies on:
     data-pdf-business-name / data-pdf-doc-noun / data-pdf-doc-number → the
       continuation-page header ("Income Summary  2026")
     data-pdf-block → blocks moved to the LAST page (the total row, footer) */

export interface IncomePaymentRow {
  date: string;      // display date "Mar 4, 2026"
  invoice: string;   // "INV-0042", or "—"
  method: string;    // "Cash App (via Stripe)"
  amount: number;
}

export interface IncomeClientBlock {
  client: string;
  count: number;
  total: number;
  payments: IncomePaymentRow[];
}

export interface IncomeSummaryData {
  businessName: string;
  logoUrl?: string | null;
  periodLabel: string;
  rangeStart: string;
  rangeEnd: string;
  generatedOn: string;
  clients: IncomeClientBlock[];
  total: number;
  count: number;     // number of payments
}

const INCOME_DISCLAIMER =
  'This is a record of payments recorded in On It, grouped by client — payments you logged and payments made through your On It pay page. It is not tax advice. Confirm totals against your bank records.';

const TH: React.CSSProperties = {
  padding: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: MUTED, fontWeight: 700,
};

export function IncomeSummaryTemplate({ d, accent }: { d: IncomeSummaryData; accent: string }) {
  return (
    <div style={PAGE}>
      <div style={{ textAlign: 'center' }}>
        {d.logoUrl && <img src={d.logoUrl} style={{ height: 84, marginBottom: 12 }} alt="" />}
        <div
          data-pdf-business-name
          style={{
            fontSize: d.logoUrl ? 28 : 40,
            fontWeight: 800,
            color: INK,
            ...(d.logoUrl ? {} : { fontFamily: MONTSERRAT, letterSpacing: -0.5 }),
          }}
        >
          {d.businessName}
        </div>
      </div>

      {/* (1) accent rule line under the header */}
      <div style={{ height: 3, background: accent, margin: '20px 0 28px' }} />

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: MONTSERRAT, color: INK }}>
          <span data-pdf-doc-noun>Income Summary</span> — <span data-pdf-doc-number>{d.periodLabel}</span>
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>
          Period covered: {d.rangeStart} – {d.rangeEnd}
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
          Generated {d.generatedOn}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: 'left', width: 120 }}>Date</th>
            <th style={{ ...TH, textAlign: 'left', width: 110 }}>Invoice</th>
            <th style={{ ...TH, textAlign: 'left' }}>Method</th>
            <th style={{ ...TH, textAlign: 'right', width: 130 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {d.clients.flatMap((c, ci) => [
            // Client header — (3) thin accent separator above each client group
            <tr key={`c${ci}`} style={{ borderTop: `1px solid ${accent}59` }}>
              <td colSpan={4} style={{ padding: '14px 0 6px', color: INK, fontSize: 14, fontWeight: 800 }}>
                {c.client}
                <span style={{ fontWeight: 400, color: MUTED, fontSize: 12 }}>
                  {'  ·  '}{c.count} {c.count === 1 ? 'payment' : 'payments'}
                </span>
              </td>
            </tr>,
            ...c.payments.map((p, pi) => (
              <tr key={`c${ci}p${pi}`}>
                <td style={{ padding: '5px 0', color: INK, fontSize: 13 }}>{p.date}</td>
                <td style={{ padding: '5px 0', color: INK, fontSize: 13 }}>{p.invoice}</td>
                <td style={{ padding: '5px 0', color: INK, fontSize: 13 }}>{p.method}</td>
                <td style={{ padding: '5px 0', textAlign: 'right', color: INK, fontSize: 13 }}>{money(p.amount)}</td>
              </tr>
            )),
            <tr key={`c${ci}s`}>
              <td colSpan={3} style={{ padding: '6px 0 12px', textAlign: 'right', color: MUTED, fontSize: 12 }}>
                Subtotal · {c.client}
              </td>
              <td style={{ padding: '6px 0 12px', textAlign: 'right', color: INK, fontWeight: 700, fontSize: 13 }}>{money(c.total)}</td>
            </tr>,
          ])}
        </tbody>
      </table>

      {/* (2) total row — accent framed, still black text on white. Moves to the
          last page on a multi-page document. */}
      <div
        data-pdf-block="total"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 8,
          padding: '14px 0',
          borderTop: `2.5px solid ${accent}`,
          borderBottom: `2.5px solid ${accent}`,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, color: INK }}>
          Total received · {d.count} {d.count === 1 ? 'payment' : 'payments'}
        </span>
        <span style={{ fontSize: 26, fontWeight: 800, fontFamily: MONTSERRAT, color: INK }}>
          {money(d.total)}
        </span>
      </div>

      <div data-pdf-block="footer" style={{ position: 'absolute', left: 56, right: 56, bottom: 44 }}>
        <div style={{ height: 1, background: '#e0e0e0', marginBottom: 12 }} />
        <p style={{ fontSize: 11, lineHeight: 1.6, color: MUTED, margin: 0 }}>{INCOME_DISCLAIMER}</p>
        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 10, letterSpacing: 1.5, color: MUTED, opacity: 0.8 }}>
          Generated by On It
        </div>
      </div>
    </div>
  );
}

export { INCOME_DISCLAIMER };
