// The bank-slide read waits on the tiers flag: with NEXT_PUBLIC_TIERS off the
// slides don't exist, so opening a recap must not call /api/recaps/bank or wait.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('RecapProvider: the bank fields are read only with the tiers flag on', () => {
  const src = readFileSync(new URL('./RecapProvider.tsx', import.meta.url), 'utf8');
  assert.match(src, /if \(!NEXT_PUBLIC_TIERS \|\| !canBank \|\| !r\.payload\) \{ setStory\(r\); return; \}/);
});
