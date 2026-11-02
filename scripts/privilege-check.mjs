// Runs supabase/snippets/privilege_check.sql and prints one PASS/FAIL line per
// check. Exit code 0 = all PASS, 1 = any FAIL or an error.
//
//   npm run db:privcheck
//   npm run db:privcheck -- --db-url "postgresql://…"
//   PRIVCHECK_DB_URL="postgresql://…" npm run db:privcheck
//
// Target selection:
//   • With --db-url / PRIVCHECK_DB_URL, the query runs against THAT database.
//     Only the parsed host is printed — never the user, password, or full URL.
//     A URL containing the production ref (bitfmmffnigxjjyxoxfr) is refused
//     unless --allow-prod is also passed. Do not pass --allow-prod for feature
//     work; it exists for the documented post-push production check.
//   • Without an override, the target is the LINKED project and the banner
//     prints its ref. Check the banner before trusting a result: a database
//     without the migrations reports SKIP, which looks like a pass.
//
// Rows BA1-BA6 (paywall v3) must be present in the output, SKIP included; a
// result without them fails.
//
// The same SQL file still runs as-is in the SQL Editor: it is a single query
// returning the same table.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PROD_REF = 'bitfmmffnigxjjyxoxfr';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlFile = path.join('supabase', 'snippets', 'privilege_check.sql');

// ── Target ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const allowProd = argv.includes('--allow-prod');
const dbUrlArg = (() => {
  const eq = argv.find((a) => a.startsWith('--db-url='));
  if (eq) return eq.slice('--db-url='.length);
  const i = argv.indexOf('--db-url');
  return i >= 0 ? argv[i + 1] : undefined;
})();
const override = (dbUrlArg || process.env.PRIVCHECK_DB_URL || '').trim();

const connectionArgs = [];
if (override) {
  let host;
  try {
    const parsed = new URL(override);
    host = parsed.host; // host:port only — never credentials
    if (!host) throw new Error('no host');
  } catch {
    console.error('privilege check: PRIVCHECK_DB_URL/--db-url is not a valid database URL.');
    process.exit(2);
  }
  if (override.includes(PROD_REF) && !allowProd) {
    console.error(
      'privilege check: refusing a URL that contains the production ref ' +
        `(${PROD_REF}). Pass --allow-prod only for the documented production check.`,
    );
    process.exit(2);
  }
  console.log(`TARGET: ${host} (override)`);
  connectionArgs.push('--db-url', override);
} else {
  // The CLI stores the linked ref here. Missing is not fatal — the banner still
  // makes it obvious that no branch override was supplied.
  let ref = 'unknown';
  try {
    ref = readFileSync(path.join(root, 'supabase', '.temp', 'project-ref'), 'utf8').trim() || 'unknown';
  } catch {
    /* no link file */
  }
  console.log(`TARGET: linked project (${ref})`);
  connectionArgs.push('--linked');
}

// Ask for JSON explicitly. Without it the CLI picks its format by detecting
// whether an AI agent is running it: JSON for an agent, a box-drawing table in
// a plain terminal (the "Unexpected token '┌'" failure on Windows). --agent no
// pins the shape too: a bare array of rows, not the agent's { rows } envelope.
const scrub = (s) => (override ? s.split(override).join('<db-url>') : s);
const run = spawnSync(
  'npx',
  [
    'supabase',
    'db',
    'query',
    ...connectionArgs,
    '--agent',
    'no',
    '--output-format',
    'json',
    '-f',
    sqlFile,
  ],
  {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32', // npx is npx.cmd on Windows
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  },
);
if (run.status !== 0) {
  console.error('privilege check: supabase db query failed');
  console.error(scrub((run.stderr || run.stdout || '').trim()));
  process.exit(1);
}

// Rows from either JSON shape: a bare array (--agent no) or { rows: [...] }
// (agent mode, if an older CLI ignores --agent). Anything else is a clear stop.

const out = run.stdout.trim();
let parsed;
try {
  parsed = JSON.parse(out);
} catch {
  console.error('privilege check: the Supabase CLI did not return JSON, so the results could not be read.');
  console.error('It was asked for JSON (--output-format json). Update the CLI (npx supabase --version; this script was');
  console.error('checked with 2.119.0) and run again. First lines of what it printed instead:');
  console.error(out.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}
const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
if (!Array.isArray(rows) || rows.length === 0 || typeof rows[0]?.check_id !== 'string') {
  console.error('privilege check: the CLI returned JSON, but not the expected check rows (check_id, result, expected, found).');
  console.error(out.slice(0, 2000));
  process.exit(1);
}

// SKIP = the check's migration isn't pushed yet; not a failure.
const label = (r) => (r.result === 'PASS' || r.result === 'SKIP' ? r.result : 'FAIL');
const width = Math.max(...rows.map((r) => r.check_id.length));
for (const r of rows) {
  console.log(`${label(r)}  ${r.check_id.padEnd(width)}  ${r.expected}`);
  if (label(r) === 'FAIL') console.log(`${' '.repeat(6 + width)}  found: ${r.found}`);
}
// Rows that must be in the output at all (a SKIP still counts as present). A
// stale copy of the SQL, or a query that dropped a section, must not pass.
const REQUIRED = [
  'BA1', 'BA2', 'BA3', 'BA4', 'BA5', 'BA6',
  'BB1', 'BB2', 'BB3', 'BB4', 'BB5', 'BB6', 'BB7', 'BB8', 'BB9', 'BB10',
];
const missing = REQUIRED.filter((id) => !rows.some((r) => r.check_id.split(' ')[0] === id));
for (const id of missing) console.log(`FAIL  ${id}  row missing from the privilege check output`);
const count = (s) => rows.filter((r) => label(r) === s).length;
const failed = count('FAIL') + missing.length;
const skipped = count('SKIP');
console.log(`\n${count('PASS')} PASS, ${failed} FAIL${skipped ? `, ${skipped} SKIP (migration not pushed yet)` : ''}`);
process.exit(failed ? 1 : 0);
