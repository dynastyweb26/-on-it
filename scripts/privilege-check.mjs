// Runs supabase/snippets/privilege_check.sql and prints one PASS/FAIL line per
// check. Exit code 0 = all PASS, 1 = any FAIL or an error.
//
//   npm run db:privcheck
//   npm run db:privcheck -- --db-url "postgresql://…"
//   PRIVCHECK_DB_URL="postgresql://…" npm run db:privcheck
//
// A query that errors prints the database's own error text and
// "PRIVCHECK ERROR: no results, not a pass", then exits 1. An error is never
// reported as a pass and never counts as one. The result/error handling lives in
// scripts/lib/privcheck-result.mjs so a test can feed it a failed query.
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
import { reportQueryRun } from './lib/privcheck-result.mjs';

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

// Everything after the query — reading the rows, or reporting why there are
// none — is in the pure handler. Errors go to stderr with a non-zero code.
const report = reportQueryRun(run, { redact: scrub });
const print = report.stream === 'stderr' ? console.error : console.log;
for (const line of report.lines) print(line);
process.exitCode = report.exitCode;
