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

test('invoice delete: a failed soft delete throws into the sheet, which names the cause', () => {
  const body = fn(detail, 'async function handleDelete()');
  assert.match(body, /if \(error\) \{[\s\S]*throw error;/, 'the sheet renders the cause');
  assert.doesNotMatch(body, /Not deleted\./, 'D1 replaced the inline sentence');
  assert.match(detail, /consequence=\{invoiceDeleteConsequence\(/, 'says what did not happen');
  assert.match(detail, /deleteActionLabel\(deleteNoun/, 'the go button carries the figure');
  assert.match(detail, /typed=\{deleteNeedsTyped\(inv\.status\) \? 'DELETE'/, 'typed word only on sent records');
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

// ── Sign sheet (public estimate) ──
const signSheet = readFileSync('src/components/estimate/SignSheet.tsx', 'utf8');

test('sign sheet: a second Approve in the same frame is dropped by a ref', () => {
  const submit = signSheet.slice(signSheet.indexOf('async function submit()'), signSheet.indexOf('return ('));
  assert.match(submit, /if \(!canSubmit \|\| submittingRef\.current\) return;\s*submittingRef\.current = true;/);
});

test('sign sheet: a failure names its cause, stays open, and clears pending on every exit', () => {
  const submit = signSheet.slice(signSheet.indexOf('async function submit()'), signSheet.indexOf('return ('));
  assert.match(submit, /setError\(signFailureMessage\(err\)\)/);
  assert.match(submit, /setError\(mapped\.message\)/, 'a mapped server refusal keeps its own sentence');
  assert.match(submit, /finally \{\s*submittingRef\.current = false;\s*setSubmitting\(false\);\s*\}/);
  assert.match(signSheet, /onClick=\{submit\} disabled=\{!canSubmit\}/);
  assert.match(signSheet, /\{submitting \? \(/, 'the busy label replaces the action');
  assert.match(signSheet, /if \(!submitting\) onClose\(\)/, 'the scrim cannot close a signing sheet');
});

// ── Template sheets: client / product pickers ──
const templateSheets = readFileSync('src/components/template/TemplateSheets.tsx', 'utf8');
const pickerSheet = readFileSync('src/components/template/PickerSheet.tsx', 'utf8');

test('template sheets: a failed load is an error slot with Retry, never an empty list', () => {
  assert.match(templateSheets, /if \(error\) \{ setLoadError\(pickerLoadFailure\('clients', error\)\); setRows\(\[\]\); return; \}/);
  assert.match(templateSheets, /if \(error\) \{ setLoadError\(pickerLoadFailure\('items', error\)\); setRows\(\[\]\); return; \}/);
  assert.match(templateSheets, /onRetry=\{\(\) => setAttempt\(\(n\) => n \+ 1\)\}/);
});

test('template sheets: a row tap claims the guard before the pick, and a rejected pick hands it back', () => {
  assert.match(pickerSheet, /if \(!guard\.claim\(\)\) return;/);
  assert.match(pickerSheet, /\(out as Promise<void>\)\.catch\(\(\) => guard\.release\(\)\)/);
  assert.match(pickerSheet, /guard\.claim\(\)\) onUseName\(query\)/, '"Use this name" is guarded too');
});

// ── Mic blocked card (P-47) ──
test('mic card: Try again is awaited so the card keeps its busy label', () => {
  const start = chat.indexOf('{micBlocked && (');
  const block = chat.slice(start, chat.indexOf('End voice session', start));
  assert.ok(block.length > 0, 'mic card renders above the composer');
  assert.match(block, /busyLabel: 'Asking…'/);
  assert.match(block, /onSelect: async \(\) => \{ micRetryRef\.current = true; await startRecording\(\); \}/);
  assert.match(block, /onSelect: \(\) => \{ inputRef\.current\?\.focus\(\); \}/, 'typing is always offered');
});

test('mic card: a retry that is still blocked says so instead of looping silently', () => {
  const body = chat.slice(chat.indexOf('async function startRecording()'), chat.indexOf('// ── The composer'));
  assert.match(body, /if \(!micRetryRef\.current\) setMicBlocked\(null\);/);
  assert.match(body, /setMicBlocked\(\{ card: micBlockedCard\(isIosDevice\(\)\), still: retried \}\)/);
  assert.match(chat, /error=\{micBlocked\.still \? MIC_STILL_BLOCKED : undefined\}/);
});

// ── Alerts card (P-52): push was refused or failed ──
test('alerts card: a real cause, one way to the switch, and a card rather than a toast', () => {
  const block = chat.slice(chat.indexOf('{alertsFailed && ('), chat.indexOf('{termsPrompt && ('));
  assert.ok(block.length > 0, 'alerts card renders');
  assert.match(block, /tone="error"/);
  assert.match(block, /text=\{ALERTS_FAILED_TEXT\}/);
  assert.match(block, /onSelect: \(\) => \{ setAlertsFailed\(false\); router\.push\(ALERTS_SETTINGS_HREF\); \}/);
});

test('alerts card: only a Yes that failed raises it; Not now is not a failure', () => {
  const yes = chat.slice(chat.indexOf('async function enableReminders()'), chat.indexOf('function dismissReminders()'));
  assert.match(yes, /const ok = await subscribeToPush\(\);/);
  assert.match(yes, /if \(!ok\) \{ setAlertsFailed\(true\); return; \}/);
  const no = chat.slice(chat.indexOf('function dismissReminders()'), chat.indexOf('// ── Receipt capture'));
  assert.doesNotMatch(no, /alertsFailed\(/, 'declining never raises the card');
});

// P-66 (shared, but not marked sent): one primitive set, both screens.
for (const [name, src] of [['chat', chat], ['invoice detail', detail]] as const) {
  test(`P-66 ${name}: S1 sheet + S1b card are PopSheet/PopInline, mark-sent throws on failure`, () => {
    assert.match(src, /from '@\/lib\/popups\/unsent-share'/);
    assert.doesNotMatch(src, /@\/lib\/popups\/PopSheet|retryMarkSent/, 'no second primitive set, no old banner');
    assert.match(src, /async function postMarkSharedSent[\s\S]{0,260}throw res \?\? new TypeError/);
    assert.match(src, /title=\{copy\.title\}[\s\S]{0,700}runs: true/, 'retry-share runs through the pending path');
    assert.match(src, /tone="error"[\s\S]{0,200}unsentShareCopy\(unsentShare[^)]*\)\.cardTitle/, 'S1b card');
  });

  test(`P-66 ${name}: share starts synchronously, a cancel says nothing, a completed send retires the state`, () => {
    const i = src.indexOf('async function shareSharedAgain');
    const body = src.slice(i, i + 900);
    assert.match(body, /const (shared|r) = await sharePdf|const shared = sharePdf/);
    assert.match(body, /status === 'cancelled'\) return/);
    assert.match(src, /setUnsentShare\(null\);\s*setUnsentShareOpen\(false\);/);
  });
}

// ── S1b retry (spec 7b): a card with no file yet cannot share one, and a card
// restored from the row still builds on a tier whose sends build at the tap.
test('S1b: Retry the share is disabled until the file is ready', () => {
  const action = chat.slice(
    chat.indexOf("label: pdfReady ? 'Retry the share'"),
    chat.indexOf('onSelect: () => shareSharedAgain(unsentShare)'),
  );
  assert.ok(action.length > 0, 'the S1b share action exists');
  assert.match(action, /label: pdfReady \? 'Retry the share' : 'Preparing…'/, 'the label names the wait');
  assert.match(action, /disabled: !pdfReady/, 'the tap is refused until the file exists');
});

test('S1b: a restored card on a build-at-tap tier still builds its file', () => {
  assert.match(chat, /if \(skipPreBuild && !s1bNeedsFile\) return;/, 'the pre-build must not skip a restored S1b');
  assert.match(chat, /: skipPreBuild && !s1bNeedsFile \? false/, 'readiness stays false, not skipped, on that tier');
});
