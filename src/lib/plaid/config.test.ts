// ═══ Plaid gate + config ═══
// The fail-closed rule every /api/plaid/* route depends on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plaidBaseUrl, plaidCredentials, plaidRouteEnabled, plaidTokenKey, plaidWebhookUrl,
} from './config';

test('routes fail closed: only VERCEL_ENV=preview is enabled', () => {
  assert.equal(plaidRouteEnabled('preview'), true);
  assert.equal(plaidRouteEnabled('production'), false);
  assert.equal(plaidRouteEnabled('development'), false);
  assert.equal(plaidRouteEnabled(''), false);
  assert.equal(plaidRouteEnabled(undefined), false);
});

test('PLAID_ENV maps to sandbox by default and never guesses an unknown host', () => {
  assert.equal(plaidBaseUrl(undefined), 'https://sandbox.plaid.com');
  assert.equal(plaidBaseUrl(''), 'https://sandbox.plaid.com');
  assert.equal(plaidBaseUrl('sandbox'), 'https://sandbox.plaid.com');
  assert.equal(plaidBaseUrl('Production'), 'https://production.plaid.com');
  assert.equal(plaidBaseUrl('prod'), null);
  assert.equal(plaidBaseUrl('staging'), null);
});

test('credentials are absent unless all three values are usable', () => {
  const env = { PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'secret', PLAID_ENV: 'sandbox' };
  assert.deepEqual(plaidCredentials(env), {
    clientId: 'id', secret: 'secret', baseUrl: 'https://sandbox.plaid.com',
  });
  assert.equal(plaidCredentials({ ...env, PLAID_CLIENT_ID: '  ' }), null);
  assert.equal(plaidCredentials({ ...env, PLAID_SECRET: undefined }), null);
  assert.equal(plaidCredentials({ ...env, PLAID_ENV: 'nope' }), null);
});

test('the webhook points at this preview deployment only', () => {
  assert.equal(
    plaidWebhookUrl('on-it-abc.vercel.app'),
    'https://on-it-abc.vercel.app/api/plaid/webhook',
  );
  assert.equal(plaidWebhookUrl(''), null);
  assert.equal(plaidWebhookUrl(undefined), null);
});

test('the token key is server env only and empty means absent', () => {
  assert.equal(plaidTokenKey({ PLAID_TOKEN_ENC_KEY: ' k ' }), 'k');
  assert.equal(plaidTokenKey({ PLAID_TOKEN_ENC_KEY: '  ' }), null);
  assert.equal(plaidTokenKey({}), null);
});
