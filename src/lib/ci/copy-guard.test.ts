// Ratchet: the retired word "quote" may not appear in NEW user-facing copy, and
// the stored `kind` may not be printed to the screen. Existing hits are frozen in
// tests/copy-baseline.json and only ever go down (npm run copy:baseline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanRepo } from './copy-repo';
import { overBaseline, type Baseline } from './copy-scan';

// fileURLToPath, not URL.pathname: on Windows pathname is "/C:/...", which
// doubled the drive letter when joined onto a path.
const root = fileURLToPath(new URL('../../../', import.meta.url));

test('no new user-facing "quote" copy beyond tests/copy-baseline.json', () => {
  const baseline = JSON.parse(readFileSync(`${root}tests/copy-baseline.json`, 'utf8')) as Baseline;
  const problems = overBaseline(scanRepo(root), baseline);
  assert.deepEqual(problems, [], `\n${problems.join('\n')}\nFix the copy (say "estimate"); do not raise the baseline.`);
});
