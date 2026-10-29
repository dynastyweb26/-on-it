import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVoiceHints, cleanTerm, customSpellings, MAX_TERMS, MAX_WORDS } from './voice-hints';

test('trims, collapses whitespace, strips tags and newlines', () => {
  assert.equal(cleanTerm('  Cyril   Door  '), 'Cyril Door');
  assert.equal(cleanTerm('<b>Cyril</b>\n\nDoor & Handyman'), 'Cyril Door & Handyman');
  assert.equal(cleanTerm('Deck\tstaining\r\nquote'), 'Deck staining quote');
  assert.equal(cleanTerm('\n\n  <i>paint</i>  \n'), 'paint');
});

test('drops terms under three characters', () => {
  assert.deepEqual(buildVoiceHints(['Al', ' AC ', 'Cyril']), ['Cyril']);
  assert.deepEqual(buildVoiceHints(['2', ' ']), []);
});

test('dedupes case-insensitively, keeping the first spelling', () => {
  assert.deepEqual(buildVoiceHints(['Cyril', 'cyril', 'CYRIL', 'Cyril Door']), ['Cyril', 'Cyril Door']);
});

test('caps a term at six words', () => {
  const six = 'one two three four five six';
  const seven = 'one two three four five six seven';
  assert.equal(six.split(' ').length, MAX_WORDS);
  assert.deepEqual(buildVoiceHints([six, seven]), [six]);
});

test('caps the list at fifty terms', () => {
  const many = Array.from({ length: 80 }, (_, i) => `Client ${i}`);
  const hints = buildVoiceHints(many);
  assert.equal(hints.length, MAX_TERMS);
  assert.equal(hints[0], 'Client 0');
  assert.equal(hints[MAX_TERMS - 1], `Client ${MAX_TERMS - 1}`);
});

test('a custom cap is honoured', () => {
  assert.deepEqual(buildVoiceHints(['Alpha', 'Bravo', 'Charlie'], 2), ['Alpha', 'Bravo']);
});

test('ignores null, undefined and non-strings', () => {
  const input = ['Cyril', null, undefined, '', '   '] as ReadonlyArray<string | null | undefined>;
  assert.deepEqual(buildVoiceHints(input), ['Cyril']);
});

test('custom sparing only for single-token names', () => {
  assert.deepEqual(
    customSpellings(['Cyril', 'Cyril Door & Handyman', 'Zelle']),
    [{ from: 'Cyril', to: 'Cyril' }, { from: 'Zelle', to: 'Zelle' }],
  );
  assert.deepEqual(customSpellings([]), []);
});
