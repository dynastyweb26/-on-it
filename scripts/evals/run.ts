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
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { REGISTRY } from '../../src/lib/tools/registry';
import { fixtureDb, type FixtureRows } from '../../src/lib/tools/fixture-db';
import { createTurnBudget } from '../../src/lib/tools/budget';
import { runToolTurn, systemForTurn, type ModelCall } from '../../src/lib/tools/turn';
import { MODEL } from '../../src/lib/ai';

export type EvalCase = {
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
    /** Require the whole sequence, in order. Absent grades the last tool only. */
    toolsExact?: boolean;
    templateId?: string | null;
    /** Other tool sequences that also satisfy this case, each with its template. */
    alternatives?: Array<{ tools: string[]; templateId?: string | null }>;
    writes?: number;
    refused?: boolean;
    args?: Record<string, Record<string, unknown>>;
    /**
     * Wording the reply must name, any one of the listed phrases: a lookup that
     * resolves nobody or more than one is complete when the reply says so, and
     * that is part of the answer. Case-insensitive substring. Omit to grade no
     * wording at all, which is the rule for every other case.
     */
    replyIncludes?: string | string[];
    /**
     * Every one of these phrases must appear. A name that matches two clients is
     * only a complete answer when the reply names both, so an ambiguous case
     * grades all of them, not any one.
     */
    replyIncludesAll?: string[];
  };
};

export type Result = {
  id: string;
  tags: string[];
  pass: boolean;
  reasons: string[];
  /** Every tool the turn ran, with its status: printed even when the case passes. */
  sequence?: string[];
};
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

/**
 * The first expected tool set the actual sequence matches, if any.
 *
 * Default: the LAST tool that ran is the answer, so a lookup the model did on
 * the way (find_client before list_invoices) cannot fail a case. A case that
 * wants the whole sequence says "toolsExact": true.
 */
export function matchingToolSet(
  expect: Pick<EvalCase['expect'], 'tools' | 'templateId' | 'alternatives' | 'toolsExact'>,
  called: readonly string[],
): { tools: string[]; templateId?: string | null } | undefined {
  const exact = expect.toolsExact === true;
  return [expect, ...(expect.alternatives ?? [])].find((candidate) => {
    const tools = candidate.tools ?? [];
    if (exact) return JSON.stringify(called) === JSON.stringify(tools);
    if (tools.length === 0) return called.length === 0;
    return called[called.length - 1] === tools[tools.length - 1];
  });
}

/**
 * The reply is graded only when the case names wording. Any one listed phrase
 * satisfies it, because the model composes the sentence: "No client matches"
 * and "Zebediah isn't on file" are both a complete answer for a name nobody has.
 */
export function replyMismatch(
  expect: Pick<EvalCase['expect'], 'replyIncludes' | 'replyIncludesAll'>,
  reply: string,
): string | null {
  const text = reply.toLowerCase();
  const all = expect.replyIncludesAll ?? [];
  const missing = all.filter((phrase) => !text.includes(phrase.toLowerCase()));
  if (missing.length) return `reply does not name: ${missing.join(', ')}`;
  if (expect.replyIncludes === undefined) return null;
  const wanted = Array.isArray(expect.replyIncludes) ? expect.replyIncludes : [expect.replyIncludes];
  if (wanted.length === 0) return null;
  return wanted.some((phrase) => text.includes(phrase.toLowerCase()))
    ? null
    : `reply names none of: ${wanted.join(', ')}`;
}

/**
 * The card is graded only when the case names one. An absent templateId means
 * "do not grade the card" — most cases only care which tool ran — and only an
 * explicit `templateId: null` asks for no card at all.
 */
export function templateMismatch(
  expected: { templateId?: string | null },
  actual: string | null,
): string | null {
  if (!('templateId' in expected)) return null;
  return expected.templateId === actual
    ? null
    : `template ${actual} != expected ${expected.templateId ?? null}`;
}

function realCall(apiKey: string): ModelCall {
  const client = new Anthropic({ apiKey });
  return async ({ system, tools, messages }) =>
    client.messages.create({ model: MODEL, max_tokens: 512, system, tools, messages });
}

// ── Recorded runs: replay the model, run everything else for real ───────────
//
// A live run costs money and needs a key, so it cannot be the gate. Recording
// saves every model response per case; replay feeds those responses back through
// the SAME loop, so handlers, the client resolver, cards, money rules and
// grading all run for real — only the model is a file.
//
// A recording only speaks for the prompt and tools it was made against: change
// either and it says nothing about today's code, so it is reported STALE rather
// than passing or failing. The date in the prompt is normalised out of the hash,
// otherwise every recording would be stale by tomorrow morning.

export const RECORDINGS_DIR = 'evals/recordings';

export type Recording = {
  version: 1;
  caseId: string;
  /** sha256 over the prompt and the tool definitions this was recorded against. */
  hash: string;
  /** Every model response, in the order the turn asked for one. */
  responses: unknown[];
};

export type ReplayOutcome = {
  id: string;
  /** graded: the recording ran and was graded. stale/missing: reported, not run. */
  state: 'graded' | 'stale' | 'missing';
  result?: Result;
};

/** The prompt with its clock taken out, so a hash only moves when someon edits it. */
export function stablePrompt(system: string): string {
  return system
    .replace(/Today is [^.]*?\(\d{4}-\d{2}-\d{2}\)\./g, 'Today is <today>.')
    .replace(/The current month is [A-Z][a-z]+ \d{4}\./g, 'The current month is <month>.');
}

export function recordingHash(system: string, tools: readonly unknown[]): string {
  return createHash('sha256')
    .update(`${stablePrompt(system)}\n${JSON.stringify(tools)}`)
    .digest('hex');
}

function recordingPath(dir: string, file: string, caseId: string): string {
  return join(dir, file, `${caseId}.json`);
}

function readRecording(dir: string, file: string, caseId: string): Recording | null {
  const path = recordingPath(dir, file, caseId);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Recording;
  if (parsed?.version !== 1 || parsed.caseId !== caseId || !Array.isArray(parsed.responses)) {
    throw new Error(`${path} is not a recording for case ${caseId}`);
  }
  return parsed;
}

function writeRecording(dir: string, file: string, recording: Recording): void {
  const path = recordingPath(dir, file, recording.caseId);
  mkdirSync(join(dir, file), { recursive: true });
  writeFileSync(path, `${JSON.stringify(recording, null, 2)}\n`);
}

/** The model, as a file: the recorded response for each call, in order. */
export function replayCall(responses: readonly unknown[]): ModelCall {
  let index = 0;
  return async () => {
    const next = responses[index];
    if (next === undefined) {
      throw new Error(`the recording ran out after ${index} model call(s)`);
    }
    index += 1;
    return next as Awaited<ReturnType<ModelCall>>;
  };
}

/**
 * No network, by force: any fetch during replay throws instead of reaching out.
 * Returns the restore, so a caller can put the real fetch back.
 */
export function forbidNetwork(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.reject(new Error('[evals] replay tried to reach the network'))) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * One case, replayed from its recording. Signed-out cases never call a model, so
 * they need no recording. Stale and missing cases are NOT graded: they say
 * nothing about today's code, so failing the gate on them would be a lie.
 */
export async function replayCase(input: {
  testCase: EvalCase;
  file: string;
  recordingsDir?: string;
}): Promise<ReplayOutcome> {
  const { testCase } = input;
  const dir = input.recordingsDir ?? RECORDINGS_DIR;
  const restore = forbidNetwork();
  try {
    if (isSignedOut(testCase)) {
      return { id: testCase.id, state: 'graded', result: await runCase(testCase, null) };
    }

    const db = fixtureDb(testCase.fixture);
    const hash = recordingHash(await systemForTurn(db, OWNER), REGISTRY.modelTools());
    const recording = readRecording(dir, input.file, testCase.id);
    if (!recording) return { id: testCase.id, state: 'missing' };
    if (recording.hash !== hash) return { id: testCase.id, state: 'stale' };

    try {
      const result = await runCase(testCase, replayCall(recording.responses));
      return { id: testCase.id, state: 'graded', result };
    } catch (e) {
      // A recording that no longer fits the loop is a real failure, not stale:
      // the prompt and tools are unchanged, so something else moved.
      return {
        id: testCase.id,
        state: 'graded',
        result: {
          id: testCase.id,
          tags: testCase.tags ?? [],
          pass: false,
          reasons: [(e as Error).message],
        },
      };
    }
  } finally {
    restore();
  }
}

/** A live call, recorded as it goes. Returns the graded result and the calls saved. */
export async function recordCase(input: {
  testCase: EvalCase;
  call: ModelCall;
  file: string;
  recordingsDir?: string;
}): Promise<{ result: Result; responses: number }> {
  const dir = input.recordingsDir ?? RECORDINGS_DIR;
  const responses: unknown[] = [];
  let hash: string | null = null;
  const recordingCall: ModelCall = async (request) => {
    if (hash === null) hash = recordingHash(request.system, request.tools);
    const message = await input.call(request);
    responses.push(message);
    return message;
  };

  const result = await runCase(input.testCase, recordingCall);
  if (hash !== null) {
    writeRecording(dir, input.file, {
      version: 1,
      caseId: input.testCase.id,
      hash,
      responses,
    });
  }
  return { result, responses: responses.length };
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

export async function runCase(testCase: EvalCase, call: ModelCall | null): Promise<Result> {
  const reasons: string[] = [];
  const tags = testCase.tags ?? [];
  const expect = testCase.expect;

  // A signed-out user never reaches a tool and never reaches the model, so the
  // graded turn is an empty one: the cases say that with "tools": [] and
  // "writes": 0. "refused": true still works for a case that spells it out.
  if (isSignedOut(testCase)) {
    if (expect.refused) return { id: testCase.id, tags, pass: true, reasons: [], sequence: [] };
    if ((expect.tools ?? []).length > 0) reasons.push('a signed-out case cannot expect a tool');
    if ((expect.writes ?? 0) !== 0) reasons.push('a signed-out turn cannot write');
    if (expect.templateId) reasons.push('a signed-out case cannot expect a card');
    return { id: testCase.id, tags, pass: reasons.length === 0, reasons, sequence: [] };
  }

  if (!call) {
    return { id: testCase.id, tags, pass: false, reasons: ['ANTHROPIC_API_KEY is not set'], sequence: [] };
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

  const okRuns = result.toolRuns.filter((run) => run.status === 'ok');
  const called = okRuns.map((run) => run.name);
  const sequence = result.toolRuns.map((run) =>
    run.status === 'ok' ? run.name : `${run.name} (${run.status})`,
  );
  const matchedExpect = matchingToolSet(expect, called);
  if (!matchedExpect) {
    const expected = [expect, ...(expect.alternatives ?? [])].map((candidate) =>
      JSON.stringify(candidate.tools),
    );
    reasons.push(`tools ${JSON.stringify(called)} != expected ${expected.join(' or ')}`);
  }

  // The answering call is the last ok run of that tool, the same one graded above.
  for (const [name, expectedArgs] of Object.entries(expect.args ?? {})) {
    const run = okRuns.filter((candidate) => candidate.name === name).pop();
    if (run && !argsMatch(expectedArgs, run.args)) {
      reasons.push(`args for ${name} ${JSON.stringify(run.args)} != ${JSON.stringify(expectedArgs)}`);
    }
  }

  const answer = okRuns[okRuns.length - 1];
  const templateId = answer ? REGISTRY.find(answer.name)?.defaultTemplate.id ?? null : null;
  if (matchedExpect) {
    const templateReason = templateMismatch(matchedExpect, templateId);
    if (templateReason) reasons.push(templateReason);
  }

  const replyReason = replyMismatch(expect, result.replyText);
  if (replyReason) reasons.push(replyReason);

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

  return { id: testCase.id, tags, pass: reasons.length === 0, reasons, sequence };
}

function printResult(result: Graded): void {
  const state = result.gatePass ? 'PASS' : 'FAIL';
  const note = result.pass !== result.gatePass ? '  (expected fail)' : '';
  console.log(`${state}  ${result.id}${result.tags.length ? `  [${result.tags.join(', ')}]` : ''}${note}`);
  // Always the whole sequence, so a wasted lookup stays visible on a pass.
  console.log(`      tools: ${result.sequence?.length ? result.sequence.join(' -> ') : 'none'}`);
  for (const reason of result.reasons) console.log(`      ${reason}`);
}

/** The gate, said once, so live and replay judge the same way. */
function reportOverall(overall: ReturnType<typeof summarizeResults>): number {
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

/** --replay: no key, no client, no network. Only recordings are graded. */
async function replayRun(files: readonly string[]): Promise<number> {
  const graded: Graded[] = [];
  let stale = 0;
  let missing = 0;

  for (const file of files) {
    let cases: EvalCase[];
    try {
      cases = load(file);
    } catch (e) {
      console.error(`[evals] ${(e as Error).message}`);
      return 1;
    }

    const label = relative(process.cwd(), file);
    console.log(`\n[evals] ${label}`);
    const results: Graded[] = [];
    for (const testCase of cases) {
      const outcome = await replayCase({ testCase, file: basename(file, '.json') });
      if (outcome.state === 'stale') {
        stale += 1;
        console.log(`STALE    ${testCase.id}  (the prompt or tools changed since it was recorded)`);
        continue;
      }
      if (outcome.state === 'missing') {
        missing += 1;
        console.log(`MISSING  ${testCase.id}  (no recording yet)`);
        continue;
      }
      const gradedResult = applyExpectedFail(testCase, outcome.result as Result);
      graded.push(gradedResult);
      results.push(gradedResult);
      printResult(gradedResult);
    }
    const summary = summarizeResults(results);
    console.log(
      `[evals] ${label}: ${summary.passed}/${summary.total} graded passed (${(summary.rate * 100).toFixed(0)}%)`,
    );
  }

  console.log(`\n[evals] replay: ${graded.length} graded, ${stale} stale, ${missing} missing`);
  if (graded.length === 0) {
    // Nothing recorded (a clean checkout, or the founder has not run --record
    // yet): there is nothing to judge, so the gate has nothing to fail.
    console.log('[evals] no recordings to replay: nothing was graded.');
    return 0;
  }
  return reportOverall(summarizeResults(graded));
}

async function main(): Promise<number> {
  const replay = process.argv.includes('--replay');
  const record = process.argv.includes('--record');
  if (replay && record) {
    console.error('[evals] --record and --replay are different runs; choose one.');
    return 1;
  }

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

  if (replay) return replayRun(files);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[evals] ANTHROPIC_API_KEY is not set: a live or recording run needs one model key.');
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
    for (const testCase of cases) {
      const graded = record
        ? await recordCase({ testCase, call, file: basename(file, '.json') })
        : { result: await runCase(testCase, call) };
      results.push(applyExpectedFail(testCase, graded.result));
    }
    all.push(...results);

    const label = relative(process.cwd(), file);
    console.log(`\n[evals] ${label}`);
    for (const result of results) printResult(result);
    const summary = summarizeResults(results);
    console.log(
      `[evals] ${label}: ${summary.passed}/${summary.total} passed (${(summary.rate * 100).toFixed(0)}%)`,
    );
  }

  if (record) console.log(`\n[evals] recordings saved under ${RECORDINGS_DIR}/`);
  return reportOverall(summarizeResults(all));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
