// Result/error handling for scripts/privilege-check.mjs, kept out of the CLI
// wrapper so a test can feed it a failed query. Nothing here runs a process or
// prints: it takes the finished query and returns { exitCode, stream, lines }
// for the caller to print.
//
// The rule this file exists for: a SQL error must never look like, or be
// counted as, a pass. Every path that produced no check rows returns a non-zero
// exitCode and ends with NO_RESULTS, and the real database error text is shown
// (code, message, line/position when the error carries them).

/** @typedef {{ status?: number | null, stdout?: string, stderr?: string }} QueryRun */
/** @typedef {{ exitCode: number, stream: 'stdout' | 'stderr', lines: string[] }} Report */

export const NO_RESULTS = 'PRIVCHECK ERROR: no results, not a pass';

// Rows that must be in the output at all (a SKIP still counts as present). A
// stale copy of the SQL, or a query that dropped a section, must not pass.
export const REQUIRED_CHECKS = [
  'BA1', 'BA2', 'BA3', 'BA4', 'BA5', 'BA6',
  'BB1', 'BB2', 'BB3', 'BB4', 'BB5', 'BB6', 'BB7', 'BB8', 'BB9', 'BB10',
  'BC1',
  'BD1', 'BD2', 'BD3', 'BD4', 'BD5', 'BD6', 'BD7', 'BD8', 'BD9',
  'BF1',
];

// Postgres/psql put these in the plain-text error, not always in structured form.
const SQLSTATE_RE = /\bSQLSTATE[:\s]+([0-9A-Z]{5})\b/i;
const LINE_RE = /\bLINE[:\s]+(\d+)\b/i;
const POSITION_RE = /\bPosition[:\s]+(\d+)\b/i;

const text = (value) => (typeof value === 'string' ? value : '');

/**
 * The error object inside a CLI JSON error payload, if the text is one.
 * Handles `{ "error": {...} }`, a bare `{ "message", "code" }`, and an error
 * string. A healthy `{ rows: [...] }` payload is not an error.
 * @param {string} raw
 * @returns {Record<string, unknown> | null}
 */
function structuredError(raw) {
  const candidates = [raw, ...raw.split(/\r?\n/).slice().reverse()];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue; // not the JSON error, keep looking
    }
    const err = parsed?.error ?? parsed;
    if (typeof err === 'string' && err.trim()) return { message: err.trim() };
    if (err && typeof err === 'object' && (err.message || err.code || err.details)) return err;
  }
  return null;
}

/**
 * code / message / line / position lines for a structured error object.
 * @param {Record<string, unknown>} err
 * @param {(s: string) => string} redact
 * @returns {string[]}
 */
function errorFields(err, redact) {
  const out = [];
  if (err.code != null && String(err.code).trim()) out.push(`code: ${redact(String(err.code)).trim()}`);
  if (err.message != null && String(err.message).trim()) out.push(`message: ${redact(String(err.message)).trim()}`);
  if (err.details != null && String(err.details).trim()) out.push(`detail: ${redact(String(err.details)).trim()}`);
  if (err.hint != null && String(err.hint).trim()) out.push(`hint: ${redact(String(err.hint)).trim()}`);
  if (err.line != null && String(err.line).trim()) out.push(`line: ${String(err.line).trim()}`);
  if (err.position != null && String(err.position).trim()) out.push(`position: ${String(err.position).trim()}`);
  return out;
}

/**
 * The diagnosable error text from a failed query: structured fields when the
 * CLI printed JSON, otherwise the CLI's own words. Never nothing — a silent
 * non-zero exit still says so and points at the manual command.
 * @param {string} stderr
 * @param {string} stdout
 * @param {(s: string) => string} redact
 * @returns {string[]}
 */
function queryErrorLines(stderr, stdout, redact) {
  // stderr first: it is where the CLI writes the failure.
  const raw = redact([stderr, stdout].filter((s) => s.trim()).join('\n').trim());
  const err = raw ? structuredError(raw) : null;
  const lines = [];

  if (err) lines.push(...errorFields(err, redact));

  const code = err?.code ?? raw.match(SQLSTATE_RE)?.[1];
  const line = err?.line ?? raw.match(LINE_RE)?.[1];
  const position = err?.position ?? raw.match(POSITION_RE)?.[1];
  if (!err && code) lines.push(`code: ${String(code).trim()}`);
  if (!err && line) lines.push(`line: ${String(line).trim()}`);
  if (!err && position) lines.push(`position: ${String(position).trim()}`);

  // The plain-text error is the real message; keep it unless it was the JSON
  // just formatted into fields above.
  if (raw && !(err && raw.trim().startsWith('{'))) lines.push(raw);

  if (lines.length === 0) {
    lines.push('the Supabase CLI exited non-zero and printed no error text, so there is nothing to diagnose from here.');
    lines.push('Reproduce it by hand to see the database error:');
    lines.push('  npx supabase db query --linked -f supabase/snippets/privilege_check.sql');
  }
  return lines;
}

/** @returns {Report} */
const failure = (lines) => ({ exitCode: 1, stream: 'stderr', lines: [...lines, NO_RESULTS] });

/** @param {{ check_id: string, result: string }} r */
const label = (r) => (r.result === 'PASS' || r.result === 'SKIP' ? r.result : 'FAIL');

/**
 * Turn the finished query into the exact lines to print plus the exit code.
 * Success renders one PASS/FAIL/SKIP line per check exactly as before.
 * @param {QueryRun} run
 * @param {{ redact?: (s: string) => string }} [options]
 * @returns {Report}
 */
export function reportQueryRun(run, options = {}) {
  const redact = typeof options.redact === 'function' ? options.redact : (s) => s;
  const status = Number.isInteger(run?.status) ? /** @type {number} */ (run.status) : null;
  const stdout = text(run?.stdout);
  const stderr = text(run?.stderr);

  // The query itself failed: the CLI exits non-zero and the checks never ran.
  if (status !== 0) {
    const how = status === null ? 'was interrupted or never started' : `failed (exit ${status})`;
    return failure([
      `privilege check: supabase db query ${how}`,
      ...queryErrorLines(stderr, stdout, redact),
    ]);
  }

  const out = stdout.trim();
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    return failure([
      'privilege check: the Supabase CLI did not return JSON, so the results could not be read.',
      'It was asked for JSON (--output-format json). Update the CLI (npx supabase --version; this script was',
      'checked with 2.119.0) and run again. First lines of what it printed instead:',
      redact(out.split('\n').slice(0, 5).join('\n')),
    ]);
  }

  // A 0 exit with an error payload is still an error: never read as results.
  const payloadError =
    parsed && !Array.isArray(parsed)
      ? parsed.error ?? (parsed.rows ? null : parsed.message || parsed.code ? parsed : null)
      : null;
  if (payloadError) {
    const detail = typeof payloadError === 'string' ? { message: payloadError } : payloadError;
    return failure([
      'privilege check: the query returned an error instead of check rows',
      ...errorFields(/** @type {Record<string, unknown>} */ (detail), redact),
    ]);
  }

  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows) || rows.length === 0 || typeof rows[0]?.check_id !== 'string') {
    return failure([
      'privilege check: the CLI returned JSON, but not the expected check rows (check_id, result, expected, found).',
      redact(out.slice(0, 2000)),
    ]);
  }

  const lines = [];
  const width = Math.max(...rows.map((r) => String(r.check_id).length));
  for (const r of rows) {
    lines.push(`${label(r)}  ${String(r.check_id).padEnd(width)}  ${r.expected}`);
    if (label(r) === 'FAIL') lines.push(`${' '.repeat(6 + width)}  found: ${r.found}`);
  }

  const missing = REQUIRED_CHECKS.filter((id) => !rows.some((r) => String(r.check_id).split(' ')[0] === id));
  for (const id of missing) lines.push(`FAIL  ${id}  row missing from the privilege check output`);
  const count = (s) => rows.filter((r) => label(r) === s).length;
  const failed = count('FAIL') + missing.length;
  const skipped = count('SKIP');
  lines.push('');
  lines.push(`${count('PASS')} PASS, ${failed} FAIL${skipped ? `, ${skipped} SKIP (migration not pushed yet)` : ''}`);

  return { exitCode: failed ? 1 : 0, stream: 'stdout', lines };
}
