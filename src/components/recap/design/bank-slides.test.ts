// Recap slides 07 (bank activity), 08 (waiting for you) and the "picked up
// from your bank" cards on 02 / 03 (design/recaps RecapPlayer.dc.html, RULE 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { redesignSequence, type RecapBank } from '@/lib/recap/payload';
import { redesignPayload } from '@/lib/recap/fixtures';
import { bankDots, pendingDate, pendingLine, pendingMore, pendingRows, pickedVerb } from './bank-view';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const ITEMS = [{ name: 'Shell', date: '2026-11-14' }, { name: 'Home Depot', date: '2026-11-13' }, { name: 'Deposit', date: '2026-11-12' }];
const bank = (b: Partial<RecapBank>): RecapBank => ({ name: 'Chase', total: 19, auto: 12, autoIn: 3, autoOut: 9, pending: 4, items: ITEMS, more: 1, ...b });
const seq = (b: RecapBank | null) => {
  const base = redesignPayload('normalWeek');
  return redesignSequence(b ? { ...base, bank: b } : base, { plan: 'pro' });
};

test('order: bank and waiting after client, before free and aff (keys())', () => {
  const k = seq(bank({}));
  assert.ok(k.indexOf('bank') > k.indexOf('inv'));
  if (k.includes('client')) assert.ok(k.indexOf('bank') > k.indexOf('client'));
  assert.equal(k.indexOf('waiting'), k.indexOf('bank') + 1);
  assert.equal(k.at(-1), 'aff');
  const free = redesignSequence({ ...redesignPayload('normalWeek'), bank: bank({}), freeRecapNumber: 1 }, { plan: 'free' });
  if (free.includes('free')) assert.ok(free.indexOf('waiting') < free.indexOf('free'));
});

test('no bank field: neither slide (flag off, or a plan without bank activity)', () => {
  const k = seq(null);
  assert.ok(!k.includes('bank') && !k.includes('waiting'));
});

test('07 only when the bank produced a record; 08 only when something is pending', () => {
  assert.ok(!seq(bank({ auto: 0, autoIn: 0, autoOut: 0 })).includes('bank'));
  assert.ok(seq(bank({ auto: 0, autoIn: 0, autoOut: 0 })).includes('waiting'));
  assert.ok(seq(bank({ pending: 0, items: [], more: 0 })).includes('bank'));
  assert.ok(!seq(bank({ pending: 0, items: [], more: 0 })).includes('waiting'));
});

test('07: the dot row caps at 36, the bank share gold, popping across 1200 ms from 1000 ms', () => {
  const d = bankDots(19, 12);
  assert.equal(d.length, 19);
  assert.equal(d.filter((x) => x.bank).length, 12);
  assert.equal(d[0].d, 1000);
  const busy = bankDots(96, 58);
  assert.equal(busy.length, 36);
  assert.equal(busy.filter((x) => x.bank).length, Math.round((58 / 96) * 36));
  assert.deepEqual(bankDots(0, 0), []);
});

test('08: the newest three, dated as the board writes them, then +N more', () => {
  assert.deepEqual(pendingRows(ITEMS, 4), [
    { name: 'Shell', date: 'Nov 14', d: 1100 }, { name: 'Home Depot', date: 'Nov 13', d: 1280 }, { name: 'Deposit', date: 'Nov 12', d: 1460 },
  ]);
  assert.equal(pendingRows(ITEMS, 1).length, 1);
  assert.equal(pendingMore(4), '+1 more');
  assert.equal(pendingMore(3), null);
  assert.equal(pendingLine(1), 'bank transaction waiting for you');
  assert.equal(pendingLine(4), 'bank transactions waiting for you');
  assert.equal(pendingDate('nope'), '');
  assert.equal(pickedVerb(1), 'was');
  assert.equal(pickedVerb(3), 'were');
});

test('in / out: the picked-up card only with the payload\'s bank, and only above zero', () => {
  assert.match(read('src/components/recap/design/DesignIn.tsx'), /\{p\.bank && <BankPickedUp count=\{p\.bank\.autoIn\} field="bank_auto_in_count" d=\{2300\} \/>\}/);
  assert.match(read('src/components/recap/design/DesignOut.tsx'), /\{p\.bank && <BankPickedUp count=\{p\.bank\.autoOut\} field="bank_auto_out_count" d=\{2400\} \/>\}/);
  assert.match(read('src/components/recap/design/BankPickedUp.tsx'), /if \(!\(count > 0\)\) return null;/);
});

test('every element animates as the board says (data-a / data-d / data-dur)', () => {
  const b = read('src/components/recap/design/DesignBank.tsx');
  for (const re of [/data-a="up" data-d="0"/, /data-a="up" data-d="100"/, /data-a="count" data-v=\{b\.auto\} data-fmt="int" data-d="400" data-dur="1200"/, /data-a="up" data-d="800"/, /data-a="pop" data-d=\{dot\.d\} data-dur="260"/, /data-a="fade" data-d="2300" data-dur="300"/, /data-a="up" data-d="2400"/]) assert.match(b, re);
  const w = read('src/components/recap/design/DesignWaiting.tsx');
  for (const re of [/data-a="up" data-d="0"/, /data-a="count" data-v=\{b\.pending\} data-fmt="int" data-d="250" data-dur="1000"/, /data-a="up" data-d="600"/, /data-a="up" data-d="800"/, /data-a="left" data-d=\{r\.d\}/, /data-a="pop" data-d="2000"/, /data-a="up" data-d="2200"/]) assert.match(w, re);
});

test('08 Review opens the bank review sheet, once', () => {
  const w = read('src/components/recap/design/DesignWaiting.tsx');
  assert.match(w, /if \(sent\.current\) return; sent\.current = true; onAction\('review-bank'\);/);
  assert.match(read('src/components/recap/RecapProvider.tsx'), /else if \(a === 'review-bank'\) window\.dispatchEvent\(new Event\('onit:bank-review-open'\)\);/);
});
