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

// ── Close template (P-16): × on a builder that has something entered ──
test('close template: the sheet does not close before the discard lands', () => {
  const sheet = chat.slice(chat.indexOf('{closeTemplateAsk && template'), chat.indexOf('{replaceAsk && ('));
  assert.ok(sheet.length > 0, 'close-template sheet exists');
  assert.doesNotMatch(sheet, /setCloseTemplateAsk\(false\);[^\n]*closeTemplateNow/, 'must not close first');
  assert.match(sheet, /onConfirm=\{\(\) => discardTemplateFromSheet\(\)\}/, 'PopSheet awaits the confirm');
  assert.match(sheet, /onSuccess=\{\(\) => setCloseTemplateAsk\(false\)\}/, 'success is what closes it');
});

test('close template: a failed soft delete throws its cause instead of being swallowed', () => {
  const strict = fn(chat, 'async function discardTemplateRowStrict');
  assert.match(strict, /const \{ error \} = await supabase[\s\S]*\.eq\('status', 'draft'\)/);
  assert.match(strict, /if \(error\) throw error;/);
  assert.ok(
    strict.indexOf('if (error) throw error;') < strict.indexOf('resetTemplateRow();'),
    'nothing resets until the row is gone, so a retry targets the same row',
  );
  assert.match(fn(chat, 'async function discardTemplateFromSheet'), /await discardTemplateRowStrict\(\)/);
});

// ── Discard an expense template: empty closes at once, entered asks first ──
test('discard expense: Start new clears the ask and the draft, Keep editing writes nothing', () => {
  const sheet = chat.slice(chat.indexOf('{discardAsk && expenseTemplate && ('), chat.indexOf('{reviseAsk && draft && (() => {'));
  assert.ok(sheet.length > 0, 'discard-expense sheet exists');
  assert.match(sheet, /onKeep=\{\(\) => setDiscardAsk\(false\)\}/);
  assert.match(sheet, /onStartNew=\{\(\) => \{ setDiscardAsk\(false\); discardExpense\(\); \}\}/);
  assert.match(sheet, /title="Discard this expense\?"/);
});

test('discard expense: dropping it is local, so there is no request to await or fail', () => {
  const discard = chat.slice(chat.indexOf('function discardExpense()'), chat.indexOf('// Owns the preview object URL'));
  assert.ok(discard.length > 0, 'discardExpense exists');
  assert.doesNotMatch(discard, /supabase|await|fetch/, 'nothing is written, so nothing can fail halfway');
  assert.match(discard, /setDiscardAsk\(false\)/, 'the ask clears on this exit too');
  assert.match(discard, /setExpenseDraft\(null\)/);
});

// ── P-01 change guard: a parse that would rewrite a linked invoice ──
test('change guard: both answers are in-transcript, gated on an idle turn, and say what was not changed', () => {
  const block = chat.slice(chat.indexOf('{pendingChange && (() => {'), chat.indexOf('{clientChoice && clientQuestionOpen'));
  assert.ok(block.length > 0, 'change guard renders');
  assert.match(block, /<PopInline/, 'an inline card the user must answer, not a sheet');
  assert.match(block, /onSelect: resolvePendingChangeUpdate/);
  assert.match(block, /onSelect: resolvePendingChangeNew/);
  assert.match(block, /disabled: phase !== null/, 'no answer while a turn is in flight');
  assert.match(block, /consequence=\{copy\.consequence\}/, 'the caller names what did not change');
});

test('change guard: the answers are synchronous resolvers, so a second run finds no question', () => {
  for (const name of ['function resolvePendingChangeUpdate()', 'function resolvePendingChangeNew()']) {
    const body = fn(chat, name);
    assert.match(body, /if \(!pendingChange\) return;/);
    assert.match(body, /setPendingChange\(null\);/);
  }
});

// ── P-02 which client: the typed name is close to saved clients ──
test('client picker: no pick lands while a turn runs, and a failure says nothing was saved', () => {
  const block = chat.slice(chat.indexOf('{clientChoice && clientQuestionOpen'), chat.indexOf('{expenseDraft && !expenseTemplate'));
  assert.ok(block.length > 0, 'client choice card renders');
  assert.match(block, /if \(phase === null\) pickClientChoice\(c\)/);
  assert.match(block, /if \(phase === null\) pickClientChoice\('new'\)/);
  assert.match(block, /consequence=\{copy\.consequence\}/, '"Nothing was saved."');
});

test('client picker: a second pick in the same frame is dropped before any work starts', () => {
  const pick = fn(chat, 'function pickClientChoice');
  assert.match(pick, /if \(!clientChoice \|\| phase\) return;/);
  assert.match(pick, /setClientChoice\(null\);/);
  assert.match(pick, /if \(choice === 'new'\)/, 'both paths go through the same guard');
});

// ── P-03 replace an unfinished template ──
test('replace template: Start new is awaited, and a failure keeps the draft it could not discard', () => {
  const sheet = chat.slice(chat.indexOf('{replaceAsk && (() => {'), chat.indexOf('// Capped so the card never pushes its own header'));
  assert.ok(sheet.length > 0, 'replace sheet renders');
  assert.match(sheet, /onConfirm=\{\(\) => openTemplate\(replaceAsk\.kind, replaceAsk\.client, true\)\}/);
  assert.match(sheet, /onSuccess=\{\(\) => setReplaceAsk\(null\)\}/);
  assert.match(sheet, /onDismiss=\{\(\) => \{ setReplaceAsk\(null\); resumeSavedTemplate\(\); \}\}/, 'dismissal means Keep editing');
  assert.match(sheet, /consequence=\{copy\.consequence\}/, '"Your unfinished draft is still here."');
});

test('replace template: only the sheet path awaits and throws the soft delete', () => {
  const open = fn(chat, 'async function openTemplate');
  assert.match(open, /if \(strictRow\) await discardTemplateRowStrict\(\);/);
  assert.match(open, /else discardTemplateRow\(\);/, 'every other caller keeps the instant path');
  assert.match(chat, /else void openTemplate\(k, client\);/, 'the + menu does not await it');
});

// ── Deposit card (Books · money in) ──
const deposits = readFileSync('src/components/bank/DepositCard.tsx', 'utf8');

test('deposit card: a second tap in the same frame is dropped by a ref before any request', () => {
  const post = deposits.slice(deposits.indexOf('async function post('), deposits.indexOf('function save()'));
  assert.ok(post.length > 0, 'post exists');
  assert.match(post, /if \(busyRef\.current\) return;\s*busyRef\.current = true;\s*setBusy\(true\);/);
  assert.match(post, /busyRef\.current = false;\s*setBusy\(false\);\s*\}/, 'the failure exit clears pending');
});

test('deposit card: Save and Don\'t add lock with a busy label while the write runs', () => {
  assert.match(deposits, /disabled=\{busy \|\| waiting \|\| !submit\}/);
  assert.match(deposits, /\{waiting \? 'Waiting for the bank' : busy \? 'Saving…' : 'Save'\}/);
  assert.match(deposits, /disabled=\{busy \|\| waiting\}[\s\S]*?Don&apos;t add/, 'Don\'t add locks too');
});

test('deposit card: a refusal names its cause in the card and nothing closes', () => {
  const post = deposits.slice(deposits.indexOf('async function post('), deposits.indexOf('function save()'));
  assert.match(post, /setError\(depositRefusalMessage\(body\?\.error\)\)/);
  assert.match(post, /catch \{\s*setError\(depositRefusalMessage\(null\)\);/);
  assert.match(deposits, /role="alert"/);
});
