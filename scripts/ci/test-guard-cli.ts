// Runs in .github/workflows/test-guard.yml on every pull request.
// Env: BASE_SHA, HEAD_SHA, PR_LABELS (JSON array of label names).
import { execFileSync } from 'node:child_process';
import { analyze, isTestFile, type ChangedFile } from '../../src/lib/ci/test-guard';

const git = (...args: string[]): string => {
  try { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch { return ''; }
};
const base = process.env.BASE_SHA ?? 'origin/main';
const head = process.env.HEAD_SHA ?? 'HEAD';
const range = `${base}...${head}`;

const files: ChangedFile[] = git('diff', '--name-status', '--no-renames', range)
  .split('\n').filter(Boolean)
  .map((l) => { const [s, ...p] = l.split('\t'); return { status: s[0] as ChangedFile['status'], path: p.join('\t') }; })
  .filter((f) => f.status === 'A' || f.status === 'M' || f.status === 'D');

const testPaths = files.map((f) => f.path).filter(isTestFile);
const testPatch = testPaths.length ? git('diff', '-U0', '--no-renames', range, '--', ...testPaths) : '';
const baselineAt = (ref: string): string | null => {
  const out = git('show', `${ref}:tests/copy-baseline.json`);
  return out === '' ? null : out;
};

const labels = JSON.parse(process.env.PR_LABELS || '[]') as string[];
const result = analyze({ files, testPatch, labels, baseline: { before: baselineAt(base), after: baselineAt(head) } });

for (const v of result.violations) console.log(`${result.approved ? 'APPROVED' : 'FAIL'}: ${v}`);
if (result.violations.length === 0) console.log('test-guard: no test, CI or baseline weakening found.');
if (!result.ok) {
  console.log('\nIf this change is intentional, the owner adds the "tests-approved" label to the PR and re-runs this check.');
  process.exit(1);
}
