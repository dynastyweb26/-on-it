// The RevenueCat migration's shape, read out of the SQL. The database can't run
// in a unit test, so this pins what the webhook design depends on: the three
// billing columns are nullable and checked, nobody but the service role may
// write them, revenuecat_events is unreadable by clients, and the backfill only
// claims live Stripe subscribers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUIRED_CHECKS } from '../../../scripts/lib/privcheck-result.mjs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SQL = read('../../../supabase/migrations/20261116130000_revenuecat_billing_source.sql');
const PRIVCHECK = read('../../../supabase/snippets/privilege_check.sql');

test('schema: billing_source, plan_change_to and plan_change_at are nullable and checked', () => {
  for (const col of ['billing_source', 'plan_change_to', 'plan_change_at']) {
    assert.match(SQL, new RegExp(`add column if not exists ${col} `), col);
  }
  assert.match(SQL, /profiles_billing_source_chk[\s\S]*check \(billing_source is null or billing_source in \('stripe', 'app_store', 'play_store'\)\)/);
  assert.match(SQL, /profiles_plan_change_to_chk[\s\S]*check \(plan_change_to is null or plan_change_to in \('pro', 'plus'\)\)/);
  // Neither half of a scheduled change means anything alone.
  assert.match(SQL, /profiles_plan_change_pair_chk[\s\S]*check \(\(plan_change_to is null\) = \(plan_change_at is null\)\)/);
});

test('schema: the three columns are privileged (no client UPDATE or INSERT)', () => {
  assert.match(
    SQL,
    /revoke update \(billing_source, plan_change_to, plan_change_at\)\s*\n\s*on public\.profiles from anon, authenticated;/,
  );
  assert.match(
    SQL,
    /revoke insert \(billing_source, plan_change_to, plan_change_at\)\s*\n\s*on public\.profiles from anon, authenticated;/,
  );
  // And the privilege check's privileged list names them.
  assert.match(PRIVCHECK, /\('billing_source'\), \('plan_change_to'\), \('plan_change_at'\)/);
});

test('schema: the backfill claims live Stripe subscribers only', () => {
  const backfill = SQL.slice(SQL.indexOf("set billing_source = 'stripe'"));
  assert.match(backfill, /where billing_source is null/);
  assert.match(backfill, /stripe_customer_id is not null/);
  assert.match(backfill, /access_tier in \('trialing', 'active', 'past_due'\)/);
});

test('schema: revenuecat_events is a service-role-only, event-keyed table', () => {
  assert.match(SQL, /event_id\s+text primary key/);
  assert.match(SQL, /processed_at timestamptz/);
  assert.match(SQL, /alter table public\.revenuecat_events enable row level security;/);
  assert.match(SQL, /revoke all on table public\.revenuecat_events from anon, authenticated;/);
  // No CREATE POLICY anywhere for the table: the service role bypasses RLS.
  assert.doesNotMatch(SQL, /create policy[^;]*revenuecat_events/i);
});

test('schema: the privilege check runs the three new rows', () => {
  for (const id of ['BK1', 'BK2', 'BK3']) {
    assert.ok(PRIVCHECK.includes(`select '${id} `), `${id} is in the SQL`);
    assert.ok(REQUIRED_CHECKS.includes(id), `${id} is required by the runner`);
  }
});
