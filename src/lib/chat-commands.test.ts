import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_GROUPS, RECORD_PAYMENT_LABEL, STARTER_CHIPS, matchCommand } from './chat-commands';

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

test('the card has spec 08 groups and no Recaps group', () => {
  assert.deepEqual(COMMAND_GROUPS.map((g) => g.title), ['Create', 'Money', 'Clients']);
  assert.ok(!COMMAND_GROUPS.some((g) => /recap/i.test(g.title)));
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

test('recording a payment is one button label, in the chip and in the row, and prefills no sentence', () => {
  const rows = COMMAND_GROUPS.flatMap((g) => g.items).filter((i) => /payment/i.test(i.name));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, RECORD_PAYMENT_LABEL);
  assert.equal(rows[0].action, 'record-payment');
  assert.ok(STARTER_CHIPS.includes(RECORD_PAYMENT_LABEL));
  // No payment phrase is suggested anywhere a chip or row could prefill it.
  const phrases = [...STARTER_CHIPS, ...COMMAND_GROUPS.flatMap((g) => g.items.map((i) => i.ex ?? ''))];
  assert.ok(!phrases.some((p) => /\bpaid\b/i.test(p)), 'no "… paid …" phrase is suggested');
});

test('there are exactly three starter chips and a hint to match', () => {
  assert.equal(STARTER_CHIPS.length, 3);
  for (const chip of STARTER_CHIPS) {
    assert.equal(matchCommand(chip), false, chip);
  }
});
