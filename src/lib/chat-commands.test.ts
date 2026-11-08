import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_GROUPS, STARTER_CHIPS, matchCommand } from './chat-commands';

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

test('every row carries a name and a phrase to drop into the input', () => {
  for (const group of COMMAND_GROUPS) {
    assert.ok(group.items.length > 0, group.title);
    for (const item of group.items) {
      assert.ok(item.name.trim().length > 0);
      assert.ok(item.ex.trim().length > 0);
      // A row phrase is a start, never the command itself.
      assert.equal(matchCommand(item.ex), false, item.ex);
    }
  }
});

test('there are exactly three starter chips and a hint to match', () => {
  assert.equal(STARTER_CHIPS.length, 3);
  for (const chip of STARTER_CHIPS) {
    assert.equal(matchCommand(chip), false, chip);
  }
});
