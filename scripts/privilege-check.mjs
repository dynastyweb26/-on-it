// Runs supabase/snippets/privilege_check.sql against the LINKED project (the
// Supabase CLI's Management API query, read-only SELECTs) and prints one
// PASS/FAIL line per check. Exit code 0 = all PASS, 1 = any FAIL or an error.
//
//   npm run db:privcheck        (or: node scripts/privilege-check.mjs)
//
// The same SQL file still runs as-is in the SQL Editor: it is a single query
// returning the same table.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlFile = path.join('supabase', 'snippets', 'privilege_check.sql');

// Ask for JSON explicitly. Without it the CLI picks its format by detecting
// whether an AI agent is running it: JSON for an agent, a box-drawing table in
// a plain terminal (the "Unexpected token '┌'" failure on Windows). --agent no
// pins the shape too: a bare array of rows, not the agent's { rows } envelope.
const run = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--agent', 'no', '--output-format', 'json', '-f', sqlFile], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32', // npx is npx.cmd on Windows
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 16 * 1024 * 1024,
});
if (run.status !== 0) {
  console.error('privilege check: supabase db query failed');
  console.error((run.stderr || run.stdout || '').trim());
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
const count = (s) => rows.filter((r) => label(r) === s).length;
const failed = count('FAIL');
const skipped = count('SKIP');
console.log(`\n${count('PASS')} PASS, ${failed} FAIL${skipped ? `, ${skipped} SKIP (migration not pushed yet)` : ''}`);
process.exit(failed ? 1 : 0);
