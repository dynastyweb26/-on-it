// BANK-TRANSFER-SPEC.md commit 5 · 4: the PDF never prints bank numbers.
// Renders every template to static HTML (the same markup html2canvas
// captures) and string-searches it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvoiceTemplate, TEMPLATES, type InvoiceRenderData, type TemplateKey } from './index';
import { buildTheme } from '@/lib/colors';

const ROUTING = '021000021';
const ACCOUNT = '123456784417';

function render(template: TemplateKey, data: Partial<InvoiceRenderData>) {
  const base: InvoiceRenderData = {
    kind: 'invoice', invoiceNumber: 97, businessName: 'TEST Bank Biz', clientName: 'TEST Bank Client',
    lineItems: [{ description: 'Service call', qty: 1, unit_price: 119 }],
    subtotal: 119, taxRate: 0, taxAmount: 0, total: 119, issuedDate: '10/15/2026',
    payUrl: 'https://onit.example/pay/tok', cashappTag: 'testtag', zelle: 'test@example.com',
  };
  // Even if a caller wrongly spread bank fields into the render data, the
  // templates have nowhere to print them.
  const d = { ...base, ...data, bankRouting: ROUTING, bankAccount: ACCOUNT, bank_routing: ROUTING } as InvoiceRenderData;
  return renderToStaticMarkup(createElement(InvoiceTemplate, { template, theme: buildTheme(['#111111', '#d4af37'], '#ffffff'), data: d }));
}

const templates = Object.keys(TEMPLATES) as TemplateKey[];

test('all 4 templates are covered', () => {
  assert.equal(templates.length, 4);
});

for (const t of templates) {
  test(`${t}: bank line present when enabled, no routing or account number`, () => {
    const html = render(t, { bankTransferAvailable: true });
    assert.match(html, /Bank transfer \/ Direct deposit/);
    assert.match(html, /pay online/);
    assert.ok(!html.includes(ROUTING), 'routing number leaked');
    assert.ok(!html.includes(ACCOUNT), 'account number leaked');
    assert.ok(!html.includes('4417'), 'account last four leaked');
  });

  test(`${t}: no bank line when disabled`, () => {
    assert.doesNotMatch(render(t, { bankTransferAvailable: false }), /Bank transfer/);
  });

  test(`${t}: no bank line without a pay link (draft / download)`, () => {
    assert.doesNotMatch(render(t, { bankTransferAvailable: true, payUrl: null }), /Bank transfer/);
  });

  test(`${t}: no bank line on a quote`, () => {
    assert.doesNotMatch(render(t, { kind: 'quote', bankTransferAvailable: true }), /Bank transfer/);
  });
}

for (const t of templates) {
  test(`${t}: bank line sits directly under the card line, above the handles`, () => {
    const html = render(t, { bankTransferAvailable: true, cardAvailable: true });
    const card = html.indexOf('Card, Apple Pay, Google Pay or Cash App Pay');
    const bank = html.indexOf('Bank transfer / Direct deposit');
    const cashapp = html.indexOf('$testtag');
    const zelle = html.indexOf('test@example.com');
    assert.ok(card >= 0 && bank > card, 'bank after card');
    assert.ok(cashapp > bank && zelle > bank, 'handles after bank');
  });
}
