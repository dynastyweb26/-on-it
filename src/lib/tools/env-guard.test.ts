// The guard exists for one accident: an AI-enabled Vercel preview wired to the
// production database. These tests pin the exact triple and prove the other
// deployments are untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_SUPABASE_REF,
  aiEnvRefusal,
  supabaseProjectRef,
} from './env-guard';

const PROD_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
const TEST_URL = 'https://aiijzulctfpzdfjqyggm.supabase.co';

test('the production ref is read out of a Supabase URL', () => {
  assert.equal(PRODUCTION_SUPABASE_REF, 'bitfmmffnigxjjyxoxfr');
  assert.equal(supabaseProjectRef(PROD_URL), PRODUCTION_SUPABASE_REF);
  assert.equal(supabaseProjectRef(TEST_URL), 'aiijzulctfpzdfjqyggm');
  assert.equal(supabaseProjectRef('https://example.com'), null);
  assert.equal(supabaseProjectRef('not a url'), null);
  assert.equal(supabaseProjectRef(undefined), null);
});

test('preview + production database + flag on refuses', () => {
  assert.equal(
    aiEnvRefusal({ flagOn: true, vercelEnv: 'preview', supabaseUrl: PROD_URL }),
    'ai_preview_points_at_production',
  );
});

test('the same preview pointed at the test project is allowed', () => {
  assert.equal(
    aiEnvRefusal({ flagOn: true, vercelEnv: 'preview', supabaseUrl: TEST_URL }),
    null,
  );
});

test('production and local development are governed by the feature flag, not this guard', () => {
  assert.equal(
    aiEnvRefusal({ flagOn: true, vercelEnv: 'production', supabaseUrl: PROD_URL }),
    null,
    'the routes already 404 in production',
  );
  assert.equal(
    aiEnvRefusal({ flagOn: true, vercelEnv: undefined, supabaseUrl: PROD_URL }),
    null,
    'local development is not a preview deployment',
  );
  assert.equal(
    aiEnvRefusal({ flagOn: false, vercelEnv: 'preview', supabaseUrl: PROD_URL }),
    null,
    'with the flag off there is no AI route to refuse',
  );
});

test('a preview with an unreadable Supabase URL is not silently treated as production', () => {
  assert.equal(aiEnvRefusal({ flagOn: true, vercelEnv: 'preview', supabaseUrl: undefined }), null);
  assert.equal(aiEnvRefusal({ flagOn: true, vercelEnv: 'preview', supabaseUrl: 'oops' }), null);
});
