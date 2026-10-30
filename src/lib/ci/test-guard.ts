// Pure rules for the "tests-not-weakened" PR check (.github/workflows/test-guard.yml).
// The CLI (scripts/ci/test-guard-cli.ts) feeds it the PR diff; the label
// `tests-approved` on the PR is the owner's explicit override.

export interface ChangedFile {
  status: 'A' | 'M' | 'D';
  path: string;
}

export interface GuardInput {
  files: ChangedFile[];
  /** Unified diff (-U0) restricted to test files. */
  testPatch: string;
  labels: string[];
  /** tests/copy-baseline.json before/after, null when absent. */
  baseline: { before: string | null; after: string | null };
}

export const APPROVAL_LABEL = 'tests-approved';

const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|^tests\/(?!copy-baseline\.json$))/;
const PROTECTED = /^(?:\.github\/workflows\/|scripts\/ci\/|src\/lib\/ci\/|playwright\.config\.[cm]?[jt]s$)/;
const BASELINE = 'tests/copy-baseline.json';

export const isTestFile = (p: string): boolean => TEST_FILE.test(p);

// Unconditional skips only: test.skip('name', ...) / it.skip(async ...) /
// { skip: true }. test.skip(!hasCreds, 'why') is a runtime condition and fine.
const SKIP_CALL = /\b(?:it|test|describe|suite)\.(?:skip|only|todo)\s*\(\s*(?:['"`]|async\b|function\b|\(\s*\)|\(\s*\{?\s*\w*\s*\}?\s*\)\s*=>)/;
const SKIP_OPT = /\bskip\s*:\s*(?:true|['"`])/;
const X_FORMS = /\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(/;
const ASSERTION = /\b(?:assert(?:\.\w+)?|expect)\s*\(/;

function countAssertions(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+') && ASSERTION.test(line)) added++;
    if (line.startsWith('-') && ASSERTION.test(line)) removed++;
  }
  return { added, removed };
}

function baselineTotals(json: string | null): { total: number; perFile: Record<string, number> } {
  const perFile: Record<string, number> = {};
  if (!json) return { total: 0, perFile };
  try {
    const b = JSON.parse(json) as { copy?: Record<string, number>; ternary?: Record<string, number> };
    for (const [k, v] of Object.entries(b.copy ?? {})) perFile[`copy:${k}`] = v;
    for (const [k, v] of Object.entries(b.ternary ?? {})) perFile[`ternary:${k}`] = v;
  } catch { /* handled by the caller as a change */ }
  return { total: Object.values(perFile).reduce((a, b) => a + b, 0), perFile };
}

export function analyze(input: GuardInput): { ok: boolean; approved: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const f of input.files) {
    if (f.status === 'D' && (isTestFile(f.path) || f.path === BASELINE)) {
      violations.push(`Deleted test file: ${f.path}`);
    }
    if ((f.status === 'M' || f.status === 'D') && PROTECTED.test(f.path)) {
      violations.push(`Changed protected CI/guard file: ${f.path}`);
    }
  }

  for (const line of input.testPatch.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    if (SKIP_CALL.test(line) || SKIP_OPT.test(line) || X_FORMS.test(line)) {
      violations.push(`Added a skipped/focused test: ${line.slice(1).trim().slice(0, 100)}`);
    }
  }

  const { added, removed } = countAssertions(input.testPatch);
  if (removed > added) {
    violations.push(`Net assertions removed from tests: -${removed - added} (removed ${removed}, added ${added})`);
  }

  if (input.baseline.before !== input.baseline.after) {
    const before = baselineTotals(input.baseline.before);
    const after = baselineTotals(input.baseline.after);
    const raised = Object.entries(after.perFile).filter(([k, v]) => v > (before.perFile[k] ?? 0)).map(([k]) => k);
    if (raised.length) {
      violations.push(`Raised ${BASELINE} (allows more "quote" copy): ${raised.slice(0, 5).join(', ')}${raised.length > 5 ? '…' : ''}`);
    }
  }

  const approved = input.labels.includes(APPROVAL_LABEL);
  return { ok: violations.length === 0 || approved, approved, violations };
}
