// The privilege check must never turn a SQL error into a silent pass. This
// feeds the script's result handler a failed query and requires the database's
// own error text plus a non-zero status. Without the fix the handler didn't
// exist and the script printed "exit 1" with no error text and no results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_RESULTS, REQUIRED_CHECKS, reportQueryRun } from '../../scripts/lib/privcheck-result.mjs';

// The real failure that went unnoticed: text || "char" is 42725, and the query
// returned no rows at all, so weeks of checks reported nothing.
const SQL_ERROR = [
  'failed to execute query: ERROR:  operator does not exist: text || "char"',
  'LINE 41:     p.provolatile || p.proisstrict',
  '             ^',
  'HINT:  No operator matches the given name and argument types.',
  'SQLSTATE: 42725',
].join('\n');

test('a SQL error prints the error text and fails, never a pass', () => {
  const report = reportQueryRun({ status: 1, stdout: '', stderr: SQL_ERROR });
  const printed = report.lines.join('\n');

  assert.notEqual(report.exitCode, 0);
  assert.equal(report.stream, 'stderr');
  assert.match(printed, /42725/, 'the SQLSTATE code must be printed');
  assert.match(printed, /operator does not exist: text \|\| "char"/, 'the message must be printed');
  assert.match(printed, /line: 41/, 'the failing line must be printed');
  assert.ok(printed.includes(NO_RESULTS), 'it must say no results, not a pass');
  assert.doesNotMatch(printed, /\b\d+ PASS\b/, 'an error must never print a PASS summary');
});

test('a silent non-zero exit still fails loudly', () => {
  const report = reportQueryRun({ status: 1, stdout: '  \n', stderr: '' });
  const printed = report.lines.join('\n');

  assert.notEqual(report.exitCode, 0);
  assert.ok(printed.includes(NO_RESULTS));
  assert.match(printed, /printed no error text/);
});

test('a JSON error payload is formatted with its code and position', () => {
  const payload = JSON.stringify({
    error: { code: '42725', message: 'operator does not exist: text || "char"', position: '15' },
  });
  const report = reportQueryRun({ status: 0, stdout: payload, stderr: '' });
  const printed = report.lines.join('\n');

  assert.notEqual(report.exitCode, 0);
  assert.match(printed, /code: 42725/);
  assert.match(printed, /message: operator does not exist/);
  assert.match(printed, /position: 15/);
  assert.ok(printed.includes(NO_RESULTS));
});

test('the connection string is never printed', () => {
  const url = 'postgresql://postgres:s3cr3t@db.example.com:5432/postgres';
  const report = reportQueryRun(
    { status: 1, stdout: '', stderr: `could not connect to ${url}\nfatal: password authentication failed` },
    { redact: (s: string) => s.split(url).join('<db-url>') },
  );
  const printed = report.lines.join('\n');

  assert.ok(!printed.includes('s3cr3t'));
  assert.ok(!printed.includes(url));
  assert.match(printed, /<db-url>/);
});

test('PASS/FAIL per-check output and the summary are unchanged', () => {
  const rows = [
    { check_id: 'AA1', result: 'PASS', expected: 'RLS on profiles', found: 'ok' },
    ...REQUIRED_CHECKS.filter((id) => id !== 'BA2').map((id) => ({
      check_id: id,
      result: 'PASS',
      expected: `check ${id}`,
      found: 'ok',
    })),
    { check_id: 'BA2', result: 'SKIP', expected: 'paywall v3', found: 'missing' },
  ];
  const report = reportQueryRun({ status: 0, stdout: JSON.stringify(rows), stderr: '' });
  const printed = report.lines.join('\n');

  assert.equal(report.exitCode, 0);
  assert.equal(report.stream, 'stdout');
  assert.match(printed, /^PASS {2}AA1 +RLS on profiles$/m);
  assert.match(printed, /^SKIP {2}BA2 +paywall v3$/m);
  // One row per REQUIRED_CHECKS id (+AA1, with BA2 the SKIP): 21 PASS today.
  assert.match(printed, /^21 PASS, 0 FAIL, 1 SKIP \(migration not pushed yet\)$/m);
  assert.ok(!printed.includes(NO_RESULTS), 'a healthy run must not mention an error');
});

test('a check returning FAIL is a FAIL, not a SQL error', () => {
  const rows = REQUIRED_CHECKS.map((id) => ({
    check_id: id,
    result: id === 'BB3' ? 'FAIL' : 'PASS',
    expected: `check ${id}`,
    found: id === 'BB3' ? 'anon can select' : 'ok',
  }));
  const report = reportQueryRun({ status: 0, stdout: JSON.stringify(rows), stderr: '' });
  const printed = report.lines.join('\n');

  assert.equal(report.exitCode, 1);
  assert.match(printed, /^FAIL {2}BB3 +check BB3$/m);
  assert.match(printed, /^ +found: anon can select$/m);
  assert.match(printed, /^20 PASS, 1 FAIL$/m);
  assert.ok(!printed.includes(NO_RESULTS));
});

test('missing required rows still fail the run', () => {
  const report = reportQueryRun({
    status: 0,
    stdout: JSON.stringify([{ check_id: 'AA1', result: 'PASS', expected: 'x', found: 'ok' }]),
    stderr: '',
  });
  const printed = report.lines.join('\n');

  assert.equal(report.exitCode, 1);
  assert.match(printed, /^FAIL {2}BA1 {2}row missing from the privilege check output$/m);
});
