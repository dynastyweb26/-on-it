// The client's email prints in every template's "Billed to / For" block, on its
// own line, and is absent when there is none. Long addresses must wrap instead
// of running past the column (overflow-wrap: anywhere).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvoiceTemplate, TEMPLATES, type InvoiceRenderData, type TemplateKey } from './index';
import { buildTheme } from '@/lib/colors';

const EMAIL = 'deffeu@gmail.com';
const LONG = `${'brandon.verylongclientname'.repeat(6)}@subdomain.example-contracting.com`;

function render(template: TemplateKey, data: Partial<InvoiceRenderData>) {
  const base: InvoiceRenderData = {
    kind: 'invoice', invoiceNumber: 42, businessName: 'TEST Biz', clientName: 'Brandon',
    clientPhone: '945-344-4550',
    lineItems: [{ description: 'Car wash', qty: 1, unit_price: 40 }],
    subtotal: 40, taxRate: 0, taxAmount: 0, total: 40, issuedDate: '10/28/2026',
  };
  return renderToStaticMarkup(createElement(InvoiceTemplate, {
    template, theme: buildTheme(['#111111', '#d4af37'], '#ffffff'), data: { ...base, ...data },
  }));
}

const templates = Object.keys(TEMPLATES) as TemplateKey[];

for (const t of templates) {
  test(`${t}: client email prints on its own line`, () => {
    const html = render(t, { clientEmail: EMAIL });
    assert.ok(html.includes(EMAIL), 'email missing');
    assert.match(html, /overflow-wrap:anywhere/, 'no wrap guard');
    assert.ok(html.includes('945-344-4550'), 'phone output changed');
  });

  test(`${t}: no email line when the client has none`, () => {
    for (const empty of [null, '', '   ', undefined] as const) {
      const html = render(t, { clientEmail: empty as string | null | undefined });
      assert.ok(!html.includes('deffeu'), 'email leaked');
      assert.equal((html.match(/@/g) ?? []).length, 0, 'stray @ from an empty email');
    }
  });

  test(`${t}: a long email renders whole and stays inside the column`, () => {
    const html = render(t, { clientEmail: LONG });
    assert.ok(html.includes(LONG), 'long email truncated');
    assert.match(html, /overflow-wrap:anywhere/);
  });

  test(`${t}: an estimate prints it too (shared client block)`, () => {
    assert.ok(render(t, { kind: 'quote', clientEmail: EMAIL }).includes(EMAIL));
  });
}
