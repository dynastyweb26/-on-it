// Wiring guards for the highest-risk popups. They read the screen source because
// mounting the full screens needs Supabase and profile props; the behavior of
// the primitives themselves is covered by the render tests beside this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const estimate = readFileSync('src/components/estimates/EstimateDetail.tsx', 'utf8');
const detail = readFileSync('src/components/invoice-detail/InvoiceDetailScreen.tsx', 'utf8');
const chat = readFileSync('src/components/tabs/ChatView.tsx', 'utf8');

function fn(src: string, name: string): string {
  const i = src.indexOf(name);
  assert.ok(i >= 0, `${name} exists`);
  return src.slice(i, i + 3200);
}

test('convert: the sheet stays open while converting, so a failure shows inside it', () => {
  const confirm = estimate.slice(estimate.indexOf('title="Convert to an invoice?"'), estimate.indexOf('consequence="Nothing was converted."'));
  assert.doesNotMatch(confirm, /setConvertAsk\(false\);\s*await/, 'must not close before the result');
  assert.match(confirm, /await convertToInvoice\(\)/);
});

test('convert: failures throw to the sheet; no generic "try again" line', () => {
  const body = fn(estimate, 'async function convertToInvoice');
  assert.match(body, /throw error;/);
  assert.match(body, /throw new Error\('attachment copy failed'\)/);
  assert.doesNotMatch(body, /Couldn't convert this estimate\. Please try again/);
});

test('convert: paywall and double-tap guards stay', () => {
  const body = fn(estimate, 'async function convertToInvoice');
  assert.match(body, /if \(busy \|\| convertingRef\.current \|\| state !== 'approved'\) return;/);
  assert.match(body, /PAYWALL_LIMIT[\s\S]{0,80}setPaywallFor\('invoice'\)/);
});

test('payment delete: a failed delete throws so the sheet shows the cause and stays open', () => {
  const body = fn(detail, 'async function handleDeletePayment');
  assert.match(body, /if \(error\) \{[\s\S]*throw error;/);
  assert.match(detail, /onConfirm=\{async \(\) => \{ await handleDeletePayment\(deletePaymentAsk\.id\); \}\}/);
});

test('invoice delete: a failed soft delete is shown with its cause, never silent', () => {
  const body = fn(detail, 'async function handleDelete()');
  assert.match(body, /if \(error\) \{[\s\S]*setShareError\(`Not deleted\. \$\{userMessage\(error\)\}`\)/);
  assert.match(body, /return;\s*\}\s*setShareError\(null\);\s*setUndoDelete\(true\)/);
});

test('Revise: confirms first, closes only on its own onSuccess, guarded against double run', () => {
  const sheet = chat.slice(chat.indexOf('{reviseAsk && draft'), chat.indexOf('{closeTemplateAsk && template'));
  assert.match(sheet, /onConfirm=\{\(\) => \{ reviseInvoice\(\); \}\}/);
  assert.match(sheet, /onSuccess=\{\(\) => setReviseAsk\(false\)\}/);
  assert.match(fn(chat, 'function reviseInvoice'), /revisingRef\.current\) return/);
});
