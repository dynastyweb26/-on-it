// ═══ The accounts route's own guarantees ═══
// Structural, because the handler needs a Next request, a session and Supabase.
// What is checked is what a reviewer cannot see from a green test run: the list
// reads through the SESSION client (RLS), selects only allow-listed columns,
// answers the gate silently, and a batch still resets one cursor and syncs once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'plaid', 'accounts', 'route.ts'),
  'utf8',
);
const GET = ROUTE.slice(ROUTE.indexOf('export async function GET'), ROUTE.indexOf('export async function POST'));
const POST = ROUTE.slice(ROUTE.indexOf('export async function POST'));

test('GET gates, then authenticates, then reads through the session client', () => {
  assert.match(GET, /if \(!plaidRouteEnabled\(process\.env\.VERCEL_ENV\)\) return fail\('accounts', 'route_disabled'\);/);
  assert.match(GET, /const supabase = await createClient\(\);/);
  assert.doesNotMatch(GET, /adminClient/, 'the list must never use the admin client');
  assert.match(GET, /\.select\(ITEMS_SELECT\)/, 'only the allow-listed columns');
  assert.doesNotMatch(GET, /access_token_enc|plaid_item_id|sync_cursor|last_sync_error/);
  assert.match(GET, /\.neq\('status', 'removed'\)/);
  assert.match(GET, /\.order\('created_at', \{ ascending: false \}\)/, 'newest first');
});

test('an unauthorized GET is one fail() line, and no other log exists there', () => {
  assert.equal((GET.match(/fail\('accounts', 'unauthorized'\)/g) ?? []).length, 1);
  assert.doesNotMatch(GET, /console\.(error|log|warn)/, 'fail() is the only logger');
});

test('the batch body is capped and keeps the single-account body', () => {
  assert.match(ROUTE, /changes: z\.array\(Change\)\.min\(1\)\.max\(MAX_TRACK_CHANGES\)/);
  assert.match(ROUTE, /const Body = z\.union\(\[Batch, Single\]\)/);
  assert.match(ROUTE, /'changes' in parsed\.data/);
});

test('all-or-nothing: an unknown id refuses before any write', () => {
  const unknownCheck = POST.indexOf('unknownAccountIds(');
  const firstUpdate = POST.indexOf(".from('plaid_accounts')");
  assert.ok(unknownCheck > 0, 'the ownership check exists');
  assert.ok(unknownCheck < POST.indexOf('.update(trackPatch('), 'it runs before the update');
  assert.ok(firstUpdate > 0);
  assert.match(POST, /if \(unknownAccountIds\(current \?\? \[\], changes\)\.length > 0\) return fail\('accounts', 'not_found'\);/);
});

test('one cursor reset and ONE sync per request', () => {
  assert.equal((ROUTE.match(/sync_cursor: null/g) ?? []).length, 1);
  assert.equal((POST.match(/waitUntil\(/g) ?? []).length, 1);
  assert.match(POST, /if \(backfillWanted\(current \?\? \[\], changes\)\)/);
});
