// ═══ Tool eval runner ═══
//
// Runs each YAML-free JSON case (issue: no YAML dependency) through the SAME
// tool loop the app uses, against a fixture database, and grades three things:
//
//   * the tools the model called, and the arguments it passed (subset match)
//   * the template id those tools declare
//   * the database state: a graded turn writes nothing, and the fixtures are
//     unchanged afterwards
//
// It never grades wording. A run is deterministic in what it checks; the model
// itself is not, so the gate is a pass rate (90% overall, zero failures on
// cases tagged money or send), reported per case.
//
// Usage:
//   ANTHROPIC_API_KEY=… node --import ./scripts/test-register.mjs scripts/evals/run.ts
//   node --import ./scripts/test-register.mjs scripts/evals/run.ts --file evals/unpaid.json
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { REGISTRY } from '../../src/lib/tools/registry';
import { fixtureDb, type FixtureRows } from '../../src/lib/tools/fixture-db';
import { createTurnBudget } from '../../src/lib/tools/budget';
import { runToolTurn, type ModelCall } from '../../src/lib/tools/turn';
import { MODEL } from '../../src/lib/ai';

type EvalCase = {
  id: string;
  tags?: string[];
  request: string;
  /** The field the cases use: this request is signed out. */
  signedOut?: boolean;
  /** The older field, still honoured: signedIn false means the same thing. */
  signedIn?: boolean;
  /** No fixture means an empty account, never a crash. */
  fixture?: FixtureRows;
  /** Known bug this case documents: the gate expects it to fail. */
  expectedFail?: boolean;
  /** Why it is expected to fail. Required whenever expectedFail is true. */
  reason?: string;
  expect: {
    tools: string[];
    templateId?: string | null;
    /** Other tool sequences that also satisfy this case, each with its template. */
    alternatives?: Array<{ tools: string[]; templateId?: string | null }>;
    writes?: number;
    refused?: boolean;
    args?: Record<string, Record<string, unknown>>;
  };
};

type Result = { id: string; tags: string[]; pass: boolean; reasons: string[] };
type Graded = Result & { gatePass: boolean };

const OWNER = '11111111-1111-1111-1111-111111111111';
const PASS_RATE = 0.9;
const BLOCKING_TAGS = new Set(['money', 'send']);

/** Every evals/*.json, sorted so the run and its report are stable. */
function evalFiles(): string[] {
  const dir = resolve('evals');
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(dir, name));
  if (files.length === 0) throw new Error('no evals/*.json files');
  return files;
}

/** The overall gate: 90% pass rate AND zero money/send failures. */
export function summarizeResults(results: readonly Pick<Graded, 'gatePass' | 'tags' | 'id'>[]) {
  const total = results.length;
  const passed = results.filter((result) => result.gatePass).length;
  const rate = total === 0 ? 0 : passed / total;
  const blocking = results.filter(
    (result) => !result.gatePass && result.tags.some((tag) => BLOCKING_TAGS.has(tag)),
  );
  return {
    total,
    passed,
    rate,
    blocking,
    ok: total > 0 && rate >= PASS_RATE && blocking.length === 0,
  };
}

function load(file: string): EvalCase[] {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { cases: EvalCase[] };
  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new Error(`no cases in ${file}`);
  }
  for (const testCase of parsed.cases) {
    if (testCase.expectedFail && !(testCase.reason ?? '').trim()) {
      throw new Error(`case ${testCase.id} is marked expectedFail without a reason`);
    }
  }
  return parsed.cases;
}

/**
 * expectedFail inverts the gate for one case, and only for that case: while the
 * known bug is still there the case passes the gate; the day the behaviour is
 * fixed the case starts passing and the gate fails until the marker is removed.
 */
export function applyExpectedFail(testCase: EvalCase, result: Result): Graded {
  if (!testCase.expectedFail) return { ...result, gatePass: result.pass };
  if (!(testCase.reason ?? '').trim()) {
    return { ...result, gatePass: false, reasons: [...result.reasons, 'expectedFail needs a reason'] };
  }
  if (result.pass) {
    return {
      ...result,
      gatePass: false,
      reasons: [...result.reasons, `marked expectedFail but passed: remove the marker (${testCase.reason})`],
    };
  }
  return { ...result, gatePass: true, reasons: result.reasons };
}

/** The first expected tool set the actual sequence matches, if any. */
export function matchingToolSet(
  expect: Pick<EvalCase['expect'], 'tools' | 'templateId' | 'alternatives'>,
  called: readonly string[],
): { tools: string[]; templateId?: string | null } | undefined {
  return [expect, ...(expect.alternatives ?? [])].find(
    (candidate) => JSON.stringify(called) === JSON.stringify(candidate.tools),
  );
}

function realCall(apiKey: string): ModelCall {
  const client = new Anthropic({ apiKey });
  return async ({ system, tools, messages }) =>
    client.messages.create({ model: MODEL, max_tokens: 512, system, tools, messages });
}

/**
 * The two fields a case may use for the same thing: "signedOut": true is what
 * the cases declare, and the older "signedIn": false keeps working. Before
 * this, only the older field was read, so every signedOut case ran signed in.
 */
export function isSignedOut(testCase: { signedIn?: boolean; signedOut?: boolean }): boolean {
  return testCase.signedOut === true || testCase.signedIn === false;
}

/** A case may accept any one of several spellings for one argument. */
function isOneOf(value: unknown): value is { oneOf: unknown[] } {
  return Boolean(value)
    && typeof value === 'object'
    && Array.isArray((value as { oneOf?: unknown }).oneOf);
}

function argsMatch(expected: Record<string, unknown> | undefined, actual: unknown): boolean {
  if (!expected) return true;
  if (!actual || typeof actual !== 'object') return false;
  const got = actual as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) =>
    isOneOf(value) ? value.oneOf.includes(got[key]) : got[key] === value,
  );
}

async function runCase(testCase: EvalCase, call: ModelCall | null): Promise<Result> {
  const reasons: string[] = [];
  const tags = testCase.tags ?? [];
  const expect = testCase.expect;

  // A signed-out user never reaches a tool and never reaches the model.
  if (isSignedOut(testCase)) {
    if (!expect.refused) reasons.push('expected a refusal for a signed-out request');
    if (!expect.refused) return { id: testCase.id, tags, pass: false, reasons };
    return { id: testCase.id, tags, pass: true, reasons: [] };
  }

  if (!call) {
    return { id: testCase.id, tags, pass: false, reasons: ['ANTHROPIC_API_KEY is not set'] };
  }

  const db = fixtureDb(testCase.fixture);
  const before = JSON.stringify(db.rows);

  const result = await runToolTurn({
    call,
    db,
    userId: OWNER,
    question: testCase.request,
    budget: createTurnBudget({ userId: OWNER }),
  });

  const called = result.toolRuns.filter((run) => run.status === 'ok').map((run) => run.name);
  const matchedExpect = matchingToolSet(expect, called);
  if (!matchedExpect) {
    const expected = [expect, ...(expect.alternatives ?? [])].map((candidate) =>
      JSON.stringify(candidate.tools),
    );
    reasons.push(`tools ${JSON.stringify(called)} != expected ${expected.join(' or ')}`);
  }

  for (const run of result.toolRuns) {
    const expectedArgs = expect.args?.[run.name];
    if (expectedArgs && run.status === 'ok' && !argsMatch(expectedArgs, run.args)) {
      reasons.push(`args for ${run.name} ${JSON.stringify(run.args)} != ${JSON.stringify(expectedArgs)}`);
    }
  }

  const templateId = result.toolRuns
    .filter((run) => run.status === 'ok')
    .map((run) => REGISTRY.find(run.name)?.defaultTemplate.id ?? null)
    .find((id) => id != null) ?? null;
  if (matchedExpect) {
    const expectedTemplateId = matchedExpect.templateId ?? null;
    if (expectedTemplateId !== templateId) {
      reasons.push(`template ${templateId} != expected ${expectedTemplateId}`);
    }
  }

  const writes = db.attempts;
  const expectedWrites = expect.writes ?? 0;
  if (writes !== expectedWrites) reasons.push(`writes ${writes} != expected ${expectedWrites}`);
  if (JSON.stringify(db.rows) !== before) reasons.push('the graded turn changed database state');

  // The model said something, even if it had no tools: an empty reply is a fail
  // only when the case expected a tool result to be phrased. A case may leave
  // `tools` out entirely (the record-payment cases do).
  if ((expect.tools ?? []).length > 0 && !result.replyText.trim()) {
    reasons.push('empty reply');
  }

  return { id: testCase.id, tags, pass: reasons.length === 0, reasons };
}

async function main(): Promise<number> {
  const fileArg = process.argv.indexOf('--file');
  let files: string[];
  try {
    if (fileArg >= 0) {
      const requested = process.argv[fileArg + 1];
      if (!requested) throw new Error('--file needs a path');
      files = [resolve(requested)];
    } else {
      files = evalFiles();
    }
  } catch (e) {
    console.error(`[evals] ${(e as Error).message}`);
    return 1;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[evals] ANTHROPIC_API_KEY is not set: the eval gate needs one model key.');
    return 1;
  }

  const call = realCall(apiKey);
  const all: Graded[] = [];
  for (const file of files) {
    let cases: EvalCase[];
    try {
      cases = load(file);
    } catch (e) {
      console.error(`[evals] ${(e as Error).message}`);
      return 1;
    }

    const results: Graded[] = [];
    for (const testCase of cases) results.push(applyExpectedFail(testCase, await runCase(testCase, call)));
    all.push(...results);

    const label = relative(process.cwd(), file);
    console.log(`\n[evals] ${label}`);
    for (const result of results) {
      const state = result.gatePass ? 'PASS' : 'FAIL';
      const note = result.pass !== result.gatePass ? '  (expected fail)' : '';
      console.log(`${state}  ${result.id}${result.tags.length ? `  [${result.tags.join(', ')}]` : ''}${note}`);
      for (const reason of result.reasons) console.log(`      ${reason}`);
    }
    const summary = summarizeResults(results);
    console.log(
      `[evals] ${label}: ${summary.passed}/${summary.total} passed (${(summary.rate * 100).toFixed(0)}%)`,
    );
  }

  const overall = summarizeResults(all);
  console.log(
    `\n[evals] overall: ${overall.passed}/${overall.total} passed (${(overall.rate * 100).toFixed(0)}%)`,
  );
  if (overall.rate < PASS_RATE) {
    console.error(`[evals] below the ${(PASS_RATE * 100).toFixed(0)}% gate`);
  }
  if (overall.blocking.length) {
    console.error(
      `[evals] ${overall.blocking.length} money/send case(s) failed: ${overall.blocking.map((r) => r.id).join(', ')}`,
    );
  }
  return overall.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
