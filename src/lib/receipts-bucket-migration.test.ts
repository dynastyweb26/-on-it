// The receipts bucket's cap is the enforcement, not the API route: storage can
// refuse an oversized or non-JPEG upload before it is stored, while
// /api/plaid/review can only refuse after downloading it. This test reads the
// migration so a later edit cannot quietly widen the limit, add a second type,
// or turn the file into something destructive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NAME = '20261102180000_receipts_bucket_limits.sql';

function migration(): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', NAME), 'utf8');
}

/** The statements only: the file's comments explain, they never run. */
function statements(): string {
  return migration().split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
}

test('the receipts bucket migration caps size at 5 MB and allows only image/jpeg', () => {
  const sql = statements();
  assert.match(sql, /update\s+storage\.buckets/i, 'it updates the bucket row');
  assert.match(sql, /set\s+file_size_limit\s*=\s*5242880\b/i, '5 MB, in bytes');
  assert.match(sql, /allowed_mime_types\s*=\s*array\s*\[\s*'image\/jpeg'\s*\]/i, 'image/jpeg, and only it');
  assert.match(sql, /where\s+id\s*=\s*'receipts'/i, 'the receipts bucket, not another one');
});

test('the receipts bucket migration is one update and nothing else', () => {
  const sql = statements();
  assert.equal((sql.match(/\bupdate\b/gi) ?? []).length, 1, 'exactly one statement');
  for (const forbidden of [
    /\bdrop\b/, /\balter\b/, /\bcreate\b/, /\binsert\b/, /\bdelete\b/, /\btruncate\b/,
    /\bgrant\b/, /\brevoke\b/, /\bpolicy\b/, /\bbucket_id\b/,
  ]) {
    assert.doesNotMatch(sql, forbidden, `a bucket-limit migration must not match ${forbidden}`);
  }
});
