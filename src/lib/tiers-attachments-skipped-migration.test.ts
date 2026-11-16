// The skipped-photos migration (TIERS-SPEC.md phase 2, item 5). It may be
// pushed before the merge only because it is ADDITIVE: two nullable columns, a
// check on one of those new columns, no default, no backfill, no grant. The
// privilege-check row is what proves the columns landed as documented, so it is
// pinned here too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MIGRATION_URL = new URL(
  '../../supabase/migrations/20261116140000_tiers_attachments_skipped.sql',
  import.meta.url,
);
const MIGRATION = readFileSync(MIGRATION_URL, 'utf8');
const PRIVCHECK = readFileSync(
  new URL('../../supabase/snippets/privilege_check.sql', import.meta.url),
  'utf8',
);

/** SQL with the comment lines stripped: the rules below are about statements,
 *  and the file's explanation must not be mistaken for a backfill. */
const sql = (source: string): string =>
  source.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

test('migration: both columns are added idempotently, nullable, with no default', () => {
  const body = sql(MIGRATION);
  assert.match(body, /add column if not exists attachments_skipped integer/);
  assert.match(body, /add column if not exists attachments_skipped_from integer/);
  assert.doesNotMatch(body, /attachments_skipped\w*\s+integer[^,;]*not null/i, 'no NOT NULL');
  assert.doesNotMatch(body, /default\s+/i, 'no default: an untouched row stays null');
  assert.doesNotMatch(body, /alter column/i, 'no changing an existing column');
  assert.doesNotMatch(body, /drop column/i);
});

test('migration: the count cannot go negative, and the check is re-runnable', () => {
  const body = sql(MIGRATION);
  assert.match(body, /drop constraint if exists invoices_attachments_skipped_nonneg/);
  assert.match(
    body,
    /add constraint invoices_attachments_skipped_nonneg\s+check \(attachments_skipped >= 0\)/,
  );
  // The check is on the NEW column only (an additive migration).
  assert.doesNotMatch(body, /check \(attachments_skipped_from/);
});

test('migration: no backfill, no data write, no grant', () => {
  const body = sql(MIGRATION);
  assert.doesNotMatch(body, /\bupdate\b/i, 'no backfill: existing rows stay null');
  assert.doesNotMatch(body, /\binsert\s+into\b/i);
  assert.doesNotMatch(body, /\bdelete\s+from\b/i);
  assert.doesNotMatch(body, /\bgrant\b/i, 'the table-level grant already covers a new column');
  assert.doesNotMatch(body, /\brevoke\b/i);
  // One table, nothing else touched.
  assert.doesNotMatch(body, /create (or replace )?(table|function|trigger|policy)/i);
});

test('privilege check: the two columns and their check have a row, keyed to the version', () => {
  assert.match(PRIVCHECK, /invoices\.attachments_skipped columns/);
  // The row must SKIP until this migration is recorded as pushed.
  assert.match(PRIVCHECK, /version = '20261116140000'/);
  assert.match(PRIVCHECK, /column_name in \('attachments_skipped', 'attachments_skipped_from'\)/);
  assert.match(PRIVCHECK, /data_type = 'integer' and is_nullable = 'YES'/);
  assert.match(PRIVCHECK, /conname = 'invoices_attachments_skipped_nonneg'/);
  // The migration's file name and the check row agree on the version.
  assert.match(MIGRATION_URL.pathname, /\/20261116140000_tiers_attachments_skipped\.sql$/);
});
