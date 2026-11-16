// TIERS-SPEC.md rule 1: the SQL gates and entitlementsFor() must agree.
//
// The database's only definition of Plus is public.is_plus() in
// 20261116100000_tiers_switch.sql. This test reads that rule OUT of the
// migration (which tiers it counts as subscribed, and that it asks for
// founder OR (paid tier AND plan = 'plus')) and walks every tier x plan pair
// against entitlementsFor(). If either side changes alone, this fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entitlementsFor } from './entitlements';

const SQL = readFileSync(
  new URL('../../supabase/migrations/20261116100000_tiers_switch.sql', import.meta.url),
  'utf8',
);

/** The tiers is_plus() treats as a live subscription, read from its body. */
function paidTiersInSql(): string[] {
  const m = SQL.match(/access_tier in \(([^)]*)\)/);
  assert.ok(m, 'is_plus lists the paid tiers (access_tier in (...))');
  const tiers = [...(m[1].matchAll(/'([a-z_]+)'/g))].map((x) => x[1]);
  assert.ok(tiers.length > 0, 'the paid tier list is not empty');
  return tiers;
}

/** The SQL rule, transcribed mechanically from the same pieces. */
const SQL_FOUNDER = /access_tier = 'founder'/.test(SQL);
const SQL_PLUS_PLAN = /plan = 'plus'/.test(SQL);
const PAID = paidTiersInSql();

function sqlIsPlus(tier: string | null | undefined, plan: string | null | undefined): boolean {
  if (SQL_FOUNDER && tier === 'founder') return true;
  return SQL_PLUS_PLAN && tier != null && PAID.includes(tier) && plan === 'plus';
}

const TIERS: Array<string | null | undefined> = [
  'free', 'trialing', 'active', 'past_due', 'canceled', 'founder', 'standard', '', null, undefined,
];
const PLANS: Array<string | null | undefined> = [null, undefined, 'pro', 'plus', 'other'];

test('tiers sql: is_plus agrees with entitlementsFor for every tier x plan pair', () => {
  assert.ok(SQL_FOUNDER, 'is_plus checks the founder tier');
  assert.ok(SQL_PLUS_PLAN, "is_plus checks plan = 'plus'");
  for (const tier of TIERS) {
    for (const plan of PLANS) {
      const label = `tier=${String(tier)} plan=${String(plan)}`;
      assert.equal(
        entitlementsFor(tier, plan).plan === 'plus',
        sqlIsPlus(tier, plan),
        label,
      );
    }
  }
});

test('tiers sql: plan alone is never enough (a free or canceled profile with plus)', () => {
  for (const tier of ['free', 'canceled', null, undefined]) {
    assert.equal(sqlIsPlus(tier, 'plus'), false, String(tier));
    assert.equal(entitlementsFor(tier, 'plus').plan, 'free', String(tier));
  }
});

test('tiers sql: the switch ships off, so every gate is today’s behaviour', () => {
  const fn = SQL.match(
    /create or replace function public\.tiers_enforced\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$/,
  );
  assert.ok(fn, 'tiers_enforced() is in the migration');
  assert.match(fn[1], /select false/, 'tiers_enforced() returns false until it is turned on');
  assert.match(SQL, /immutable/, 'the switch is an immutable constant');
});
