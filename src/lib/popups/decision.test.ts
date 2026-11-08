import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALERTS_FAILED_TEXT, ALERTS_SETTINGS_HREF, CLIPBOARD_BLOCKED_TEXT, cameraStepsLine, changeGuardCopy,
  changeGuardRows, clientChoiceCopy, isMicPermissionError, itemsSummary, micBlockedCard,
  replaceTemplateCopy, reviseSheetCopy, unfinishedFigure,
} from './decision';

const car = { description: 'Car Wash', qty: 1, unit_price: 200 };
const deck = { description: 'Deck stain', qty: 3, unit_price: 150 };

test('itemsSummary: one item, a quantity, several items, none', () => {
  assert.equal(itemsSummary([car]), 'Car Wash');
  assert.equal(itemsSummary([deck]), 'Deck stain × 3');
  assert.equal(itemsSummary([deck, car, car]), 'Deck stain × 3 + 2 more');
  assert.equal(itemsSummary([]), 'No items');
  assert.equal(itemsSummary(null), 'No items');
});

test('changeGuardRows lists only the fields that move (the board C1 case)', () => {
  const rows = changeGuardRows(
    { client_name: 'Brandon', line_items: [car] },
    { client_name: 'Mike Davis', line_items: [deck] },
  );
  assert.deepEqual(rows, [
    { k: 'Client', from: 'Brandon', to: 'Mike Davis' },
    { k: 'Items', from: 'Car Wash', to: 'Deck stain × 3' },
    { k: 'Total', from: '$200.00', to: '$450.00' },
  ]);
});

test('changeGuardRows: same client and same total adds no row for them', () => {
  const rows = changeGuardRows(
    { client_name: 'Brandon', line_items: [car] },
    { client_name: 'brandon ', line_items: [{ description: 'Wash', qty: 1, unit_price: 200 }] },
  );
  assert.deepEqual(rows.map((r) => r.k), ['Client', 'Items']);
  assert.deepEqual(changeGuardRows(null, { client_name: 'X' }), []);
});

test('changeGuardRows: tax moves the total', () => {
  const rows = changeGuardRows(
    { client_name: 'A', line_items: [car], tax_rate: 0 },
    { client_name: 'A', line_items: [car], tax_rate: 10 },
  );
  assert.deepEqual(rows, [{ k: 'Total', from: '$200.00', to: '$220.00' }]);
});

test('changeGuardCopy: invoice and estimate variants never print a stored kind', () => {
  const inv = changeGuardCopy('invoice', 7);
  assert.equal(inv.text, 'This would change INV-0007. Update it, or start a new invoice?');
  assert.equal(inv.updateLabel, 'Update INV-0007');
  assert.equal(inv.newLabel, 'Start a new invoice');
  assert.equal(inv.consequence, "INV-0007 wasn't changed.");
  const est = changeGuardCopy('quote', 3);
  assert.equal(est.newLabel, 'Start a new estimate');
  assert.equal(est.updateLabel, 'Update E-0003');
  assert.ok(!/quote/i.test(JSON.stringify(est)));
});

test('clientChoiceCopy keeps the typed name in the new-client row', () => {
  assert.equal(clientChoiceCopy('Brandon’').newLabel, 'New client “Brandon’”');
});

test('unfinishedFigure: client, first item, running total', () => {
  const fig = unfinishedFigure({
    kind: 'invoice',
    client: { name: 'Brandon' },
    items: [{ name: 'Car Wash', qty: 1, unit_price: 200 }, { name: '', qty: 1, unit_price: null }],
  });
  assert.deepEqual(fig, { label: 'Brandon · Car Wash', meta: 'Unfinished invoice', amount: '$200.00' });
  const est = unfinishedFigure({ kind: 'quote', client: null, items: [{ name: 'Deck', qty: 2, unit_price: 50 }] });
  assert.equal(est.label, 'Deck');
  assert.equal(est.meta, 'Unfinished estimate');
  assert.equal(est.amount, '$100.00');
});

test('replaceTemplateCopy names what is being requested, with the word "estimate"', () => {
  assert.equal(replaceTemplateCopy('quote').sub, 'Starting a new estimate discards it.');
  assert.equal(replaceTemplateCopy('invoice').sub, 'Starting a new invoice discards it.');
});

test('reviseSheetCopy: Revise now asks, and says what it makes and what stays', () => {
  const inv = reviseSheetCopy('invoice', 7);
  assert.equal(inv.title, 'Revise INV-0007?');
  assert.equal(inv.actionLabel, 'Make an editable copy');
  assert.equal(inv.sub, 'Opens an editable copy as a new invoice. The original stays as it was.');
  assert.equal(inv.consequence, 'INV-0007 is unchanged.');
  const est = reviseSheetCopy('quote', 3);
  assert.equal(est.title, 'Revise E-0003?');
  assert.equal(est.sub, 'Change anything, then send. Same link, same number.');
  assert.equal(est.actionLabel, 'Revise this estimate');
  assert.equal(est.consequence, 'Nothing changes until you confirm.');
  assert.equal(reviseSheetCopy('invoice', null).consequence, 'The original is unchanged.');
});

test('isMicPermissionError: only a denial gets the settings card', () => {
  assert.equal(isMicPermissionError({ name: 'NotAllowedError' }), true);
  assert.equal(isMicPermissionError({ name: 'SecurityError' }), true);
  assert.equal(isMicPermissionError({ name: 'NotFoundError' }), false);
  assert.equal(isMicPermissionError(null), false);
});

test('micBlockedCard: iPhone sends you to Settings, a browser can ask again', () => {
  const ios = micBlockedCard(true);
  assert.equal(ios.text, 'To use voice, turn on Microphone for On It in your iPhone Settings, or type instead.');
  assert.deepEqual(ios.steps.map((s) => s.to), ['Settings › On It', 'Turn on Microphone']);
  assert.equal(ios.canRetry, false);
  const web = micBlockedCard(false);
  assert.equal(web.text, 'To use voice, allow the microphone for this site in your browser settings, or type instead.');
  assert.equal(web.canRetry, true);
});

test('cameraStepsLine: only a denied camera has a settings path', () => {
  assert.equal(cameraStepsLine('denied', true), 'Settings › On It › Camera');
  assert.equal(cameraStepsLine('denied', false), 'Lock icon in the address bar › Camera › Allow');
  for (const f of ['insecure', 'unsupported', 'lost', 'unavailable']) {
    assert.equal(cameraStepsLine(f, true), null);
  }
});

test('shared strings stay verbatim', () => {
  assert.equal(ALERTS_SETTINGS_HREF, '/settings/notifications');
  assert.equal(ALERTS_FAILED_TEXT, "Couldn't turn that on. You can switch payment alerts on any time in Settings.");
  assert.equal(CLIPBOARD_BLOCKED_TEXT, 'Clipboard is blocked. Long-press the link to copy it.');
});
