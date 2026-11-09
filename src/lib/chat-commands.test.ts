import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_GROUPS, RECORD_PAYMENT_LABEL, STARTER_COUNT, STARTER_POOL, isRecordPaymentChip, matchCommand, pickStarterChips, prefillFor, seededRandom } from './chat-commands';

// ── The command fires ──────────────────────────────────────────────────────

test('a bare ? is the command', () => {
  assert.equal(matchCommand('?'), true);
  assert.equal(matchCommand('  ?  '), true);
  assert.equal(matchCommand('??'), true);
  assert.equal(matchCommand('?!'), true);
});

test('help alone is the command', () => {
  assert.equal(matchCommand('help'), true);
  assert.equal(matchCommand('Help'), true);
  assert.equal(matchCommand('help!'), true);
});

test('the what-can-you-do family is the command', () => {
  for (const text of [
    'what can you do',
    'What can you do?',
    'what else can you do',
    'what all can you do',
    'what do you do',
    'so what can you do',
    'and what can you do',
    'what can you help me with',
    'how can you help',
    'what can u do',
  ]) {
    assert.equal(matchCommand(text), true, text);
  }
});

// ── The command does not fire ──────────────────────────────────────────────

test('a job that mentions help is not the command', () => {
  for (const text of [
    'help me invoice Ruth',
    'help me invoice Ruth for the deck',
    'I need help with an invoice',
    'can you help me record a payment from Maryam',
    'what should I invoice Ruth',
  ]) {
    assert.equal(matchCommand(text), false, text);
  }
});

test('normal business messages are not the command', () => {
  for (const text of [
    '',
    '   ',
    'Ruth paid $25 Zelle',
    'Invoice Maryam $150 for the door install',
    'Estimate for Ruth, deck repair, $800',
    'Who owes me money?',
    'Remind Brandon about his invoice',
    "What's Ruth's balance?",
    'send it',
    'what',
  ]) {
    assert.equal(matchCommand(text), false, text);
  }
});

// ── The card's rows ────────────────────────────────────────────────────────

// Recaps are in scope now (owner decision 2026-11-09), so the card has the
// design's fourth group. Two design rows stay out because no path backs them.
test('the card has the design groups, including Recaps', () => {
  assert.deepEqual(COMMAND_GROUPS.map((g) => g.title), ['Create', 'Money', 'Clients', 'Recaps']);
});

test('every row has an icon and the designs phrase (the payment row is a button, see below)', () => {
  const rows = COMMAND_GROUPS.flatMap((g) => g.items);
  assert.ok(rows.every((r) => r.icon));
  assert.ok(rows.some((r) => r.ex === 'How did today go?'));
  assert.ok(rows.some((r) => r.ex === "How'd I do this week?"));
});

test('every row carries a name and either a phrase to drop into the input or an action', () => {
  for (const group of COMMAND_GROUPS) {
    assert.ok(group.items.length > 0, group.title);
    for (const item of group.items) {
      assert.ok(item.name.trim().length > 0);
      if (item.action) {
        assert.equal(item.ex, undefined, `${item.name} is a button, it carries no typed phrase`);
        continue;
      }
      assert.ok((item.ex ?? '').trim().length > 0);
      // A row phrase is a start, never the command itself.
      assert.equal(matchCommand(item.ex as string), false, item.ex);
    }
  }
});

test('the starter pool is every "What I can do" phrase', () => {
  assert.deepEqual([...STARTER_POOL], COMMAND_GROUPS.flatMap((g) => g.items.map((i) => i.ex ?? RECORD_PAYMENT_LABEL)));
  for (const chip of STARTER_POOL) assert.equal(matchCommand(chip), false, chip);
});

test('a pick is three distinct phrases from the pool', () => {
  for (let seed = 0; seed < 50; seed++) {
    const pick = pickStarterChips(seededRandom(seed));
    assert.equal(pick.length, STARTER_COUNT);
    assert.equal(new Set(pick).size, pick.length);
    for (const c of pick) assert.ok(STARTER_POOL.includes(c), c);
  }
});

test('seeded picks repeat; different seeds vary', () => {
  assert.deepEqual(pickStarterChips(seededRandom(7)), pickStarterChips(seededRandom(7)));
  const seen = new Set<string>();
  for (let seed = 0; seed < 60; seed++) seen.add(pickStarterChips(seededRandom(seed)).join('|'));
  assert.ok(seen.size > 5, 'not the same fixed three');
});

test('over many picks every phrase in the list can appear', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 200; seed++) pickStarterChips(seededRandom(seed)).forEach((c) => seen.add(c));
  assert.equal(seen.size, STARTER_POOL.length);
});

test('the pick never exceeds the pool and handles edge counts', () => {
  assert.equal(pickStarterChips(seededRandom(1), 99).length, STARTER_POOL.length);
  assert.deepEqual(pickStarterChips(seededRandom(1), 0), []);
  assert.deepEqual(pickStarterChips(seededRandom(1), 3, []), []);
  assert.deepEqual(pickStarterChips(() => 0.999999, 2, ['a', 'b', 'c']).length, 2);
});

// ── What a tap puts in the input ───────────────────────────────────────────

test('examples with specifics fill only the generic lead-in', () => {
  assert.equal(prefillFor('Estimate for Ruth, deck repair, $800'), 'Estimate for ');
  assert.equal(prefillFor('Invoice Maryam $150 for the door install'), 'Invoice ');
  assert.equal(prefillFor('Add Joe Ortiz, 945-555-0134'), 'Add a client: ');
});

test('complete questions fill whole', () => {
  for (const q of ['How did today go?', 'Who owes me money?', "How'd I do this week?"]) {
    assert.equal(prefillFor(q), q);
  }
});

test('every phrase a chip or row can show has a rule: a question fills whole, anything else a lead-in', () => {
  for (const label of STARTER_POOL) {
    if (isRecordPaymentChip(label)) continue; // a button, not a fill
    const fill = prefillFor(label);
    if (label.trim().endsWith('?')) {
      assert.equal(fill, label, `${label}: a question fills whole`);
    } else {
      assert.notEqual(fill, label, `${label}: an example must not fill whole (add it to LEAD_INS)`);
      assert.ok(!/[\d$]/.test(fill), `${label}: no amounts or numbers in the lead-in`);
      assert.match(fill, /\s$/, `${label}: ends with a space so the caret can type on`);
      assert.ok(fill.trim().length >= 3);
    }
    assert.equal(matchCommand(fill), false, label);
  }
});

test('recording a payment is one button: a row action and a chip label, never a typed sentence', () => {
  const rows = COMMAND_GROUPS.flatMap((g) => g.items).filter((i) => /payment/i.test(i.name));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, RECORD_PAYMENT_LABEL);
  assert.equal(rows[0].action, 'record-payment');
  assert.equal(rows[0].ex, undefined);
  assert.ok(STARTER_POOL.includes(RECORD_PAYMENT_LABEL));
  assert.ok(isRecordPaymentChip(RECORD_PAYMENT_LABEL));
  assert.ok(!STARTER_POOL.some((p) => /\bpaid\b/i.test(p)), 'no "... paid ..." phrase is suggested');
  assert.equal(matchCommand(RECORD_PAYMENT_LABEL), false);
});
