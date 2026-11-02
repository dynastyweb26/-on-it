// ═══ GET /api/plaid/transactions — the route's own guarantees ═══
// Structural, because the handler needs a Next request, a session and Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GET = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'plaid', 'transactions', 'route.ts'),
  'utf8',
);

test('gates, authenticates, then reads through the session client (RLS)', () => {
  const gate = GET.indexOf("fail('transactions', 'route_disabled')");
  const auth = GET.indexOf("fail('transactions', 'unauthorized')");
  const read = GET.indexOf(".from('bank_transactions')");
  assert.ok(gate > 0 && auth > gate && read > auth, 'gate → session → read');
  assert.match(GET, /const supabase = await createClient\(\);/);
  assert.doesNotMatch(GET, /adminClient/, 'the list must never use the admin client');
  assert.match(GET, /\.select\(ROW_SELECT\)/);
  assert.doesNotMatch(GET, /access_token_enc|plaid_transaction_id|sync_cursor|last_sync_error/);
});

test('a removed charge can never be listed', () => {
  assert.match(GET, /\.in\('review_state', \['new', 'needs_review'\]\)/);
  // Belt and braces: the query and the mapper both drop a removed row.
  assert.match(GET, /\.neq\('bank_state', 'removed'\)/);
  assert.match(GET, /\.is\('removed_at', null\)/);
  const view = readFileSync(
    join(process.cwd(), 'src', 'lib', 'plaid', 'transactions-view.ts'),
    'utf8',
  );
  assert.match(view, /row\.bank_state !== 'removed'/);
  assert.match(view, /!row\.removed_at/);
});

test('the decided counts come from head-only count queries', () => {
  assert.match(GET, /count: 'exact', head: true/);
  assert.match(GET, /for \(const state of COUNT_STATES\)/);
  assert.doesNotMatch(GET, /console\.(error|log|warn)/);
  assert.doesNotMatch(GET, /status:\s*[45]\d\d/);
});
