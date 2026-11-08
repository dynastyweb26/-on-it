import test from 'node:test';
import assert from 'node:assert/strict';
import { unsentShareCopy } from './unsent-share';

const base = {
  id: 'i1',
  kind: 'invoice' as const,
  number: 'INV-0007',
  client: 'Brandon Lee',
  total: 200,
  dueDate: '2026-11-12',
  // 2:14 PM local, whatever the machine's zone: built from local parts.
  sharedAt: new Date(2026, 10, 8, 14, 14).toISOString(),
  offline: true,
};

test('S1 carries the number, the client, the figure and both truths', () => {
  const copy = unsentShareCopy(base);
  assert.equal(copy.title, 'Shared, but not marked sent');
  assert.match(copy.eyebrow, /^INV-0007 · Brandon Lee · \$200\.00$/);
  assert.equal(copy.truths[0].ok, true);
  assert.equal(copy.truths[0].title, 'Brandon has the PDF');
  assert.match(copy.truths[0].body, /^Shared 2:14 PM\. They can see \$200\.00 due 11\/12\/2026\.$/);
  assert.equal(copy.truths[1].ok, false);
  assert.equal(copy.truths[1].title, 'INV-0007 is still a draft in On It');
  assert.match(copy.truths[1].body, /No pay link/);
});

test('the cause line names offline or our end, never the other', () => {
  assert.equal(unsentShareCopy(base).sub, 'You went offline right after the share sheet closed.');
  assert.equal(
    unsentShareCopy({ ...base, offline: false }).sub,
    'Something broke on our end right after the share.',
  );
});

test('a missing due date drops the clause instead of printing one', () => {
  const copy = unsentShareCopy({ ...base, dueDate: null });
  assert.equal(copy.truths[0].body.endsWith('They can see $200.00.'), true);
});

test('S1b and the done toast name the document', () => {
  const copy = unsentShareCopy(base);
  assert.equal(copy.cardTitle, 'INV-0007 is still a draft');
  assert.match(copy.cardText, /^Brandon has the PDF, but it isn’t marked sent/);
  assert.equal(copy.done, 'INV-0007 marked sent. Pay link is live.');
});

test('the invoice-detail variant renames the share action', () => {
  const copy = unsentShareCopy(base, { retryLabel: 'Share PDF again' });
  assert.match(copy.note, /Share PDF again opens the share sheet again/);
});

test('no client name falls back to neutral wording', () => {
  const copy = unsentShareCopy({ ...base, client: null });
  assert.equal(copy.truths[0].title, 'Your client has the PDF');
  assert.match(copy.eyebrow, /INV-0007 · Your client ·/);
});
