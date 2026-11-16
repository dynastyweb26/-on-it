// Closing affirmations for the last recap slide, written by On It's founder.
// Kept word for word as he wrote them. Separate from AFFIRMATIONS in
// src/components/recap/copy.ts (the opener's short rotating lines).
// Not wired up yet: the recap redesign (Claude Design) decides the slide.
export const CEO_AFFIRMATIONS = [
  'Keep showing up. The Lord will bless the works of your hands',
  'Labour in a way that God can bless your works',
  'Brick by Brick. An empire in the making?',
  'He’s watching. Don’t stop now',
  'When the time is Right the Lord will make things happen',
  'Your Hard work is showing…',
  'Even when it feels like nobody’s watching keep working',
  'Keep putting in the work, The fruit will come',
  'Don’t be anxious for results. Your efforts will show.',
  'No achievement is too high if you’re meant to reach it',
  'Keep a steady pace, nobody’s rushing you',
  'Build something you can be proud of',
  'Even when you’re at a loss of Direction, just Show up every day',
  'You are blessed, and it shouldn’t take riches for you to believe that.',
  'What are limits to the creator of the universe?',
  'Worry not about end goal. Put in the work today!',
] as const;

// ── Key phrases (founder-approved 2026-11-15) ─────────────────────────
// The same lines, in the same order, with the 1-2 key phrases wrapped in
// [brackets], the design's format, for the affirmation slide's typography (big/heavy key phrases,
// underline under the first). Not shown anywhere yet: the slide still reads
// CEO_AFFIRMATIONS. A test keeps the two lists word-for-word identical.
export const CEO_AFFIRMATION_MARKS = [
  'Keep [showing up]. The Lord will [bless] the works of your hands',
  '[Labour] in a way that God can [bless your works]',
  '[Brick by Brick]. An [empire] in the making?',
  'He’s [watching]. [Don’t stop] now',
  'When the [time is Right] the Lord will [make things happen]',
  'Your [Hard work] is [showing]…',
  'Even when it feels like nobody’s watching [keep working]',
  'Keep putting in the work, The [fruit will come]',
  'Don’t be anxious for results. Your [efforts will show].',
  'No [achievement] is too high if you’re meant to [reach it]',
  'Keep a [steady pace], nobody’s rushing you',
  '[Build] something you can be [proud of]',
  'Even when you’re at a loss of Direction, just [Show up] every day',
  'You are [blessed], and it shouldn’t take riches for you to believe that.',
  'What are [limits] to the [creator of the universe]?',
  'Worry not about end goal. Put in the [work today]!',
] as const;

/** A marked line with its brackets removed. */
export const stripMarks = (line: string) => line.replace(/[\[\]]/g, '');

// ── Picking one per recap ─────────────────────────────────────────────
// Each owner walks the whole list in their own shuffled order, one line per
// recap, and only wraps once every line has been used: their first `count`
// picks are `count` different lines. Deterministic, so an owner's order never
// changes between runs.

/** FNV-1a: a stable seed from the owner's id (same in every process). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small deterministic PRNG for the shuffle. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many lines this pick uses: 1 … the list's length. */
export const affirmationCount = (count: number) =>
  Math.max(1, Math.min(CEO_AFFIRMATIONS.length, Number.isFinite(count) ? Math.floor(count) : CEO_AFFIRMATIONS.length));

/** The owner's own order through the first `count` lines (indices into the list). */
export function affirmationOrder(userId: string, count: number = CEO_AFFIRMATIONS.length): number[] {
  const n = affirmationCount(count);
  const order = Array.from({ length: n }, (_, i) => i);
  const random = rng(hash32(userId));
  for (let i = n - 1; i > 0; i--) {   // Fisher–Yates, seeded by the owner
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The line for one of this owner's recaps. `periodIndex` is their nth recap
 *  (0-based): no line repeats until every one has been used. */
export function pickAffirmation(userId: string, periodIndex: number, count: number = CEO_AFFIRMATIONS.length): string {
  const order = affirmationOrder(userId, count);
  const at = Number.isFinite(periodIndex) ? Math.floor(periodIndex) : 0;
  return CEO_AFFIRMATIONS[order[((at % order.length) + order.length) % order.length]];
}

/** The same pick, as the design renders it: the line from CEO_AFFIRMATION_MARKS
 *  at the index pickAffirmation landed on, key phrases still in [brackets]. Used
 *  when a recap row is built, so the slide's line is fixed with the row. */
export function pickAffirmationMark(userId: string, periodIndex: number, count: number = CEO_AFFIRMATIONS.length): string {
  const plain = pickAffirmation(userId, periodIndex, count);
  const at = CEO_AFFIRMATIONS.indexOf(plain as (typeof CEO_AFFIRMATIONS)[number]);
  return (at >= 0 && CEO_AFFIRMATION_MARKS[at]) || plain;   // lists out of step: the line still plays
}
