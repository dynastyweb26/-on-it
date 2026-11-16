// The affirmation slide's line, with its key phrases in [brackets]: the same
// index pickAffirmation uses, read from CEO_AFFIRMATION_MARKS. The pick itself
// (ceo-affirmations.ts) is untouched; this only finds where it landed.
import { CEO_AFFIRMATIONS, CEO_AFFIRMATION_MARKS, pickAffirmation } from '@/lib/recap/ceo-affirmations';

export function pickMarkedAffirmation(userId: string, periodIndex: number): string {
  const plain = pickAffirmation(userId, periodIndex);
  const at = CEO_AFFIRMATIONS.indexOf(plain as (typeof CEO_AFFIRMATIONS)[number]);
  return at >= 0 ? CEO_AFFIRMATION_MARKS[at] : plain;   // an unmarked line still plays, with no key phrase
}
