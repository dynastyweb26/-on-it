// `npm run copy:baseline`: rewrites tests/copy-baseline.json from the current
// source. Run it only after REMOVING "quote" copy, to lock the lower number in.
// Raising the baseline is blocked by the test-guard check unless the PR carries
// the owner-only `tests-approved` label.
import { writeFileSync } from 'node:fs';
import { scanRepo } from '../../src/lib/ci/copy-repo';
import { toBaseline } from '../../src/lib/ci/copy-scan';

const baseline = toBaseline(scanRepo(process.cwd()));
writeFileSync('tests/copy-baseline.json', JSON.stringify(baseline, null, 2) + '\n');
const total = Object.values(baseline.copy).reduce((a, b) => a + b, 0);
console.log(`copy-baseline written: ${Object.keys(baseline.copy).length} files, ${total} copy hits, ${Object.keys(baseline.ternary).length} ternary files`);
