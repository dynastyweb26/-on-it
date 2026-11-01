// ═══ Plaid failures: status + reason code, and no secrets in the line ═══
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { failure, type FailureKind, type PlaidRoute } from './failure';

const ROUTES: PlaidRoute[] = ['link-token', 'exchange', 'accounts', 'disconnect'];

test('every failure kind has one stable status and reason code', () => {
  const table: [FailureKind, number, string][] = [
    ['route_disabled', 404, 'route_disabled'],
    ['unauthorized', 401, 'unauthorized'],
    ['plaid_not_configured', 503, 'plaid_not_configured'],
    ['rate_limited', 429, 'rate_limited'],
    ['invalid_request', 400, 'invalid_request'],
    ['not_found', 404, 'not_found'],
    ['item_unavailable', 409, 'item_unavailable'],
    ['link_token_failed', 502, 'link_token_failed'],
    ['exchange_failed', 502, 'exchange_failed'],
    ['already_linked', 409, 'already_linked'],
    ['db_read_failed', 500, 'db_read_failed'],
    ['db_insert_failed', 500, 'db_insert_failed'],
    ['db_update_failed', 500, 'db_update_failed'],
    ['db_delete_failed', 500, 'db_delete_failed'],
  ];
  for (const route of ROUTES) {
    for (const [kind, status, reason] of table) {
      const f = failure(route, kind);
      assert.equal(f.status, status, `${route} ${kind} status`);
      assert.equal(f.reason, reason, `${route} ${kind} reason`);
      assert.equal(f.line, `plaid ${route} ${status} ${reason}`);
    }
  }
});

test('Plaid and Postgres codes suffix the reason, stripped to one safe token', () => {
  assert.equal(
    failure('exchange', 'exchange_failed', 'INVALID_PUBLIC_TOKEN').line,
    'plaid exchange 502 exchange_failed:INVALID_PUBLIC_TOKEN',
  );
  assert.equal(failure('exchange', 'db_insert_failed', '23505').reason, 'db_insert_failed:23505');
  assert.equal(failure('link-token', 'link_token_failed', 'RATE_LIMIT').reason, 'link_token_failed:RATE_LIMIT');

  // A hostile detail cannot inject a newline, an address or a key name.
  const hostile = failure('exchange', 'exchange_failed', 'bad\nline access-sandbox-secret @ x');
  assert.equal(hostile.reason, 'exchange_failed:badlineaccesssandboxsecretx');
  assert.equal(hostile.line.includes('\n'), false);
  assert.doesNotMatch(hostile.line, /@|access-sandbox-/);

  // No code leaves no dangling colon.
  assert.equal(failure('exchange', 'exchange_failed', null).reason, 'exchange_failed');
  assert.equal(failure('exchange', 'exchange_failed', '   ').reason, 'exchange_failed');
});

test('the duplicate and sign-in messages ride on the failure body', () => {
  assert.equal(
    failure('exchange', 'already_linked').body.message,
    'This bank is already linked. Disconnect it first, then connect it again.',
  );
  assert.equal(failure('exchange', 'already_linked').status, 409);

  assert.deepEqual(failure('exchange', 'unauthorized').body, {
    error: 'unauthorized',
    message: 'Sign in again to connect your bank.',
  });
  // Every other 401 keeps the bare code: only the exchange has copy for it.
  assert.deepEqual(failure('link-token', 'unauthorized').body, { error: 'unauthorized' });
  assert.deepEqual(failure('accounts', 'unauthorized').body, { error: 'unauthorized' });
  assert.deepEqual(failure('disconnect', 'unauthorized').body, { error: 'unauthorized' });
});

test('no route answers a 4xx/5xx except through fail()', () => {
  const dir = join(process.cwd(), 'src', 'app', 'api', 'plaid');
  for (const name of ROUTES) {
    const file = join(dir, name, 'route.ts');
    assert.ok(existsSync(file), `${name} route exists`);
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /status:\s*[45]\d\d/, `${file} must use fail() for every non-2xx`);
    assert.match(source, /fail\('/, `${file} imports the responder`);
  }
});
