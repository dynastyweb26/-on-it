import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_RECAP_STATE, RECAP_SCHEDULE, decideAutoRecap, parseRecapState, recapStateAfterOpen, type RecapState } from './recap-schedule';
import { seededRandom } from './chat-commands';
import { weekKey } from './chat-recap';

const wed = new Date(2026, 10, 11, 9, 0); // Wed Nov 11, 9:00
const always = () => 0;      // dice always hit
const never = () => 0.999;   // dice always miss
const st = (p: Partial<RecapState> = {}): RecapState => ({ ...EMPTY_RECAP_STATE, ...p });

test('the numbers', () => {
  assert.equal(RECAP_SCHEDULE.chance, 1 / 3);
  assert.equal(RECAP_SCHEDULE.minHour, 7);
});

test('nothing before 7:00', () => {
  assert.equal(decideAutoRecap(new Date(2026, 10, 11, 6, 59), st(), always), null);
});

test('the dice decide: a miss shows nothing, a hit shows one', () => {
  assert.equal(decideAutoRecap(wed, st(), never), null);
  assert.ok(decideAutoRecap(wed, st(), always));
});

test('about one open in three over many seeded opens', () => {
  let shown = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) if (decideAutoRecap(wed, st(), seededRandom(i + 1))) shown++;
  assert.ok(shown / N > 0.28 && shown / N < 0.39, String(shown / N));
});

test('never two opens in a row', () => {
  assert.equal(decideAutoRecap(wed, st({ lastOpenShown: true }), always), null);
});

test('at most one a day, of either kind', () => {
  assert.equal(decideAutoRecap(wed, st({ lastShownDay: '2026-11-11' }), always), null);
  assert.ok(decideAutoRecap(wed, st({ lastShownDay: '2026-11-10' }), always));
});

test('the weekly shows at most once a week; the daily once a day', () => {
  // weekly already shown this week: only the daily is left
  assert.equal(decideAutoRecap(wed, st({ lastWeekly: '2026-11-09' }), always), 'daily');
  // daily already shown today and weekly shown this week: nothing
  assert.equal(decideAutoRecap(wed, st({ lastWeekly: '2026-11-09', lastDaily: '2026-11-11' }), always), null);
  // daily shown (an earlier day-of-record can't block today): only weekly left
  assert.equal(decideAutoRecap(wed, st({ lastDaily: '2026-11-11' }), always), 'weekly');
});

test('when both are eligible, the weekly is the 1-in-3 pick', () => {
  const rolls = (a: number, b: number) => { const q = [a, b]; return () => q.shift() ?? 0; };
  assert.equal(decideAutoRecap(wed, st(), rolls(0.1, 0.1)), 'weekly');
  assert.equal(decideAutoRecap(wed, st(), rolls(0.1, 0.5)), 'daily');
});

test('seeded: the same seed decides the same', () => {
  assert.equal(decideAutoRecap(wed, st(), seededRandom(5)), decideAutoRecap(wed, st(), seededRandom(5)));
});

test('a long run of opens never breaks the rules', () => {
  let state = st();
  const rand = seededRandom(42);
  const perDay = new Map<string, number>();
  const weeklyPerWeek = new Map<string, number>();
  let prevShown = false;
  let shownTotal = 0;
  for (let i = 0; i < 400; i++) {
    const now = new Date(2026, 9, 1 + Math.floor(i / 2), 9 + (i % 2), 0); // two opens a day
    const kind = decideAutoRecap(now, state, rand);
    if (kind) {
      shownTotal++;
      assert.equal(prevShown, false, 'two opens in a row');
      const day = now.toDateString();
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      if (kind === 'weekly') {
        const wk = weekKey(now);
        weeklyPerWeek.set(wk, (weeklyPerWeek.get(wk) ?? 0) + 1);
      }
    }
    state = recapStateAfterOpen(state, now, kind);
    prevShown = kind !== null;
  }
  assert.ok(shownTotal > 20, 'it does show sometimes');
  assert.ok([...perDay.values()].every((n) => n === 1), 'one a day');
  assert.ok([...weeklyPerWeek.values()].every((n) => n === 1), 'one weekly a week');
});

test('an empty recap (shown = null) counts as no recap and leaves the marks alone', () => {
  const s = st({ lastDaily: '2026-11-10', lastOpenShown: true });
  assert.deepEqual(recapStateAfterOpen(s, wed, null), { ...s, lastOpenShown: false });
});

test('showing one records the day, the kind and the time', () => {
  const s = recapStateAfterOpen(st(), wed, 'weekly');
  assert.equal(s.lastWeekly, '2026-11-09');
  assert.equal(s.lastDaily, null);
  assert.equal(s.lastShownDay, '2026-11-11');
  assert.equal(s.lastShownAt, wed.getTime());
  assert.equal(s.lastOpenShown, true);
});

test('stored state is untrusted', () => {
  assert.deepEqual(parseRecapState(null), EMPTY_RECAP_STATE);
  assert.deepEqual(parseRecapState('not json'), EMPTY_RECAP_STATE);
  assert.deepEqual(parseRecapState('{"lastDaily":5,"lastOpenShown":"yes"}'), EMPTY_RECAP_STATE);
  assert.equal(parseRecapState(JSON.stringify(recapStateAfterOpen(st(), wed, 'daily'))).lastDaily, '2026-11-11');
});
