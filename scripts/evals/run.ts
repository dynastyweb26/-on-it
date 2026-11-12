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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  signedIn?: boolean;
  fixture: FixtureRows;
  expect: {
    tools: string[];
    templateId?: string | null;
    writes?: number;
    refused?: boolean;
    args?: Record<string, Record<string, unknown>>;
  };
};

type Result = { id: string; tags: string[]; pass: boolean; reasons: string[] };

const OWNER = '11111111-1111-1111-1111-111111111111';
const PASS_RATE = 0.9;
const BLOCKING_TAGS = new Set(['money', 'send']);

function load(file: string): EvalCase[] {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { cases: EvalCase[] };
  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new Error(`no cases in ${file}`);
  }
  return parsed.cases;
}

function realCall(apiKey: string): ModelCall {
  const client = new Anthropic({ apiKey });
  return async ({ system, tools, messages }) =>
    client.messages.create({ model: MODEL, max_tokens: 512, system, tools, messages });
}

function argsMatch(expected: Record<string, unknown> | undefined, actual: unknown): boolean {
  if (!expected) return true;
  if (!actual || typeof actual !== 'object') return false;
  const got = actual as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) => got[key] === value);
}

async function runCase(testCase: EvalCase, call: ModelCall | null): Promise<Result> {
  const reasons: string[] = [];
  const tags = testCase.tags ?? [];
  const expect = testCase.expect;

  // A signed-out user never reaches a tool and never reaches the model.
  if (testCase.signedIn === false) {
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
  if (JSON.stringify(called) !== JSON.stringify(expect.tools)) {
    reasons.push(`tools ${JSON.stringify(called)} != expected ${JSON.stringify(expect.tools)}`);
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
  if ((expect.templateId ?? null) !== templateId) {
    reasons.push(`template ${templateId} != expected ${expect.templateId ?? null}`);
  }

  const writes = db.attempts;
  const expectedWrites = expect.writes ?? 0;
  if (writes !== expectedWrites) reasons.push(`writes ${writes} != expected ${expectedWrites}`);
  if (JSON.stringify(db.rows) !== before) reasons.push('the graded turn changed database state');

  // The model said something, even if it had no tools: an empty reply is a fail
  // only when the case expected a tool result to be phrased.
  if (expect.tools.length > 0 && !result.replyText.trim()) {
    reasons.push('empty reply');
  }

  return { id: testCase.id, tags, pass: reasons.length === 0, reasons };
}

async function main(): Promise<number> {
  const fileArg = process.argv.indexOf('--file');
  const file = resolve(fileArg >= 0 ? process.argv[fileArg + 1] : 'evals/unpaid.json');

  let cases: EvalCase[];
  try {
    cases = load(file);
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
  const results: Result[] = [];
  for (const testCase of cases) results.push(await runCase(testCase, call));

  for (const result of results) {
    const label = result.pass ? 'PASS' : 'FAIL';
    console.log(`${label}  ${result.id}${result.tags.length ? `  [${result.tags.join(', ')}]` : ''}`);
    for (const reason of result.reasons) console.log(`      ${reason}`);
  }

  const passed = results.filter((result) => result.pass).length;
  const rate = passed / results.length;
  const blockingFailures = results.filter(
    (result) => !result.pass && result.tags.some((tag) => BLOCKING_TAGS.has(tag)),
  );

  console.log(`\n[evals] ${passed}/${results.length} passed (${(rate * 100).toFixed(0)}%)`);
  if (rate < PASS_RATE) console.error(`[evals] below the ${(PASS_RATE * 100).toFixed(0)}% gate`);
  if (blockingFailures.length) {
    console.error(`[evals] ${blockingFailures.length} money/send case(s) failed: ${blockingFailures.map((r) => r.id).join(', ')}`);
  }
  return rate >= PASS_RATE && blockingFailures.length === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
