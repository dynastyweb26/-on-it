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

const run = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', sqlFile], {
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

let rows;
try {
  rows = JSON.parse(run.stdout).rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('no rows');
} catch (e) {
  console.error('privilege check: could not read the query output:', e.message);
  console.error(run.stdout.slice(0, 2000));
  process.exit(1);
}

const width = Math.max(...rows.map((r) => r.check_id.length));
for (const r of rows) {
  const line = `${r.result === 'PASS' ? 'PASS' : 'FAIL'}  ${r.check_id.padEnd(width)}  ${r.expected}`;
  console.log(line);
  if (r.result !== 'PASS') console.log(`${' '.repeat(6 + width)}  found: ${r.found}`);
}
const failed = rows.filter((r) => r.result !== 'PASS').length;
console.log(`\n${rows.length - failed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
