// Memory has a size and a shelf life. These tests pin both: three exchanges, 500
// characters each side, and nothing older than half an hour.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_MAX_AGE_MS,
  HISTORY_TEXT_MAX,
  HISTORY_TURNS,
  historyMessages,
  loadHistory,
  type HistoryReader,
  type HistoryRow,
} from './history';

const NOW = new Date('2026-11-14T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

const turn = (asked: string, minutes: number, said: string | null = `answer to ${asked}`): HistoryRow => ({
  user_text: asked,
  reply_text: said,
  created_at: ago(minutes),
});

test('the caps are three turns, 500 characters and thirty minutes', () => {
  assert.equal(HISTORY_TURNS, 3);
  assert.equal(HISTORY_TEXT_MAX, 500);
  assert.equal(HISTORY_MAX_AGE_MS, 30 * 60 * 1000);
});

test('only the last three exchanges survive, in the order they happened', () => {
  const rows = [turn('one', 5), turn('two', 4), turn('three', 3), turn('four', 2), turn('five', 1)];
  assert.deepEqual(
    historyMessages(rows, NOW).filter((m) => m.role === 'user').map((m) => m.content),
    ['three', 'four', 'five'],
  );
});

test('a turn older than thirty minutes is skipped, one inside it is kept', () => {
  const rows = [turn('too old', 31), turn('just inside', 29)];
  assert.deepEqual(historyMessages(rows, NOW), [
    { role: 'user', content: 'just inside' },
    { role: 'assistant', content: 'answer to just inside' },
  ]);

  // The boundary is the cutoff itself: exactly thirty minutes old is still kept.
  assert.equal(historyMessages([turn('on the line', 30)], NOW).length, 2);
});

test('a long turn is cut to 500 characters on both sides', () => {
  const rows = [turn(`q${'x'.repeat(900)}`, 1, `a${'y'.repeat(900)}`)];
  const [asked, said] = historyMessages(rows, NOW);
  assert.equal((asked.content as string).length, HISTORY_TEXT_MAX);
  assert.equal((said.content as string).length, HISTORY_TEXT_MAX);
  assert.equal((asked.content as string).startsWith('qxxx'), true);
});

test('a turn with no readable date is not trusted as recent', () => {
  const rows: HistoryRow[] = [
    { user_text: 'no date', reply_text: null, created_at: 'not a date' },
    turn('dated', 1),
  ];
  assert.deepEqual(historyMessages(rows, NOW), [
    { role: 'user', content: 'dated' },
    { role: 'assistant', content: 'answer to dated' },
  ]);
});

test('loadHistory applies the same cutoff to what it read', async () => {
  const read: HistoryReader = async () => [turn('stale', 45), turn('fresh', 2)];
  const messages = await loadHistory(read, 'chat-1', NOW);
  assert.deepEqual(messages.map((m) => m.content), ['fresh', 'answer to fresh']);
});
