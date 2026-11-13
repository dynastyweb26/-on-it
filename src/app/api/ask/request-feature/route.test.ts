import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { OWNER } from '@/lib/tools/pglite-test-db';
import {
  handleFeatureRequest,
  type FeatureRequestEmail,
} from '@/lib/ask-feature-request';
import { POST } from './route';

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';

function request(body: unknown = { messageId: MESSAGE_ID }) {
  return new NextRequest('http://localhost/api/ask/request-feature', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ALLOW = { limit: async () => true, identify: () => 'user:test' };

type Gap = {
  user_id: string;
  request_text: string;
  source: string;
  message_id: string | null;
};

type ChatChain = {
  select: () => ChatChain;
  eq: (column: string, value: unknown) => ChatChain;
  maybeSingle: () => Promise<{
    data: { id: string; user_text: string } | null;
    error: null;
  }>;
};

type GapSelectChain = {
  eq: (column: string, value: unknown) => GapSelectChain;
  maybeSingle: () => Promise<{ data: { id: string } | null; error: null }>;
};

function fakeClient(options: {
  signedIn?: boolean;
  message?: { id: string; user_text: string } | null;
  gaps?: Gap[];
  insertError?: { code: string; message: string } | null;
} = {}) {
  const gaps = options.gaps ?? [];
  const filters: Record<string, unknown> = {};
  const tables: string[] = [];
  const message = options.message === undefined
    ? { id: MESSAGE_ID, user_text: 'Add mileage tracking' }
    : options.message;

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.signedIn === false ? null : { id: OWNER, email: 'owner@example.com' } },
        error: null,
      }),
    },
    from(table: string) {
      tables.push(table);

      if (table === 'chat_messages') {
        const chain: ChatChain = {
          select: () => chain,
          eq: (column, value) => {
            filters[column] = value;
            return chain;
          },
          maybeSingle: async () => ({ data: message, error: null }),
        };
        return chain;
      }

      if (table === 'help_gaps') {
        return {
          select: () => {
            const chain: GapSelectChain = {
              eq: (column, value) => {
                filters[column] = value;
                return chain;
              },
              maybeSingle: async () => ({
                data: gaps.some(
                  (gap) => gap.user_id === filters.user_id && gap.message_id === filters.message_id,
                )
                  ? { id: 'gap-1' }
                  : null,
                error: null,
              }),
            };
            return chain;
          },
          insert: async (row: Gap) => {
            if (options.insertError) return { error: options.insertError };
            gaps.push(row);
            return { error: null };
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, gaps, filters, tables };
}

test('the AI flag gate answers 404 before auth or a write', async () => {
  const res = await POST(request());
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not found' });
});

test('signed-out callers get 401', async () => {
  const fake = fakeClient({ signedIn: false });
  const res = await handleFeatureRequest(
    request(),
    fake.client as never,
    ALLOW as never,
  );
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), {
    error: 'signed_out',
    reply: "You're signed out. Sign in, then try again.",
  });
});

test('a limited caller gets 429 after auth', async () => {
  const calls: string[] = [];
  const fake = fakeClient();
  const guards = {
    limit: async (route: string, identifier: string) => {
      calls.push(`${route}:${identifier}`);
      return false;
    },
    identify: (_req: NextRequest, userId: string) => `user:${userId}`,
  };

  const res = await handleFeatureRequest(
    request(),
    fake.client as never,
    guards as never,
  );

  assert.equal(res.status, 429);
  assert.deepEqual(calls, [`parse:user:${OWNER}`]);
  assert.deepEqual(fake.tables, [], 'no database read after the limit');
  assert.deepEqual(await res.json(), { reply: 'One sec — slow down a moment.' });
});

test("a caller cannot request a feature from another owner's message", async () => {
  const fake = fakeClient({ message: null });
  const res = await handleFeatureRequest(
    request(),
    fake.client as never,
    ALLOW as never,
  );

  assert.equal(res.status, 403);
  assert.deepEqual(fake.filters, { id: MESSAGE_ID, user_id: OWNER });
  assert.deepEqual(fake.gaps, []);
  assert.deepEqual(await res.json(), {
    error: 'not_found',
    reply: 'That message is not available.',
  });
});

test('a repeat is one row and one email', async () => {
  const fake = fakeClient();
  const emails: Parameters<FeatureRequestEmail>[0][] = [];
  const email: FeatureRequestEmail = async (input) => {
    emails.push(input);
  };

  const first = await handleFeatureRequest(
    request(),
    fake.client as never,
    ALLOW as never,
    email,
  );
  const second = await handleFeatureRequest(
    request(),
    fake.client as never,
    ALLOW as never,
    email,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(fake.gaps, [{
    user_id: OWNER,
    request_text: 'Add mileage tracking',
    source: 'chat_request',
    message_id: MESSAGE_ID,
  }]);
  assert.deepEqual(emails, [{
    question: 'Add mileage tracking',
    userId: OWNER,
    userEmail: 'owner@example.com',
  }]);
});

test('an email failure never fails the saved request', async () => {
  const fake = fakeClient();
  const email: FeatureRequestEmail = async () => {
    throw new Error('resend down');
  };

  const res = await handleFeatureRequest(
    request(),
    fake.client as never,
    ALLOW as never,
    email,
  );

  assert.equal(res.status, 200);
  assert.equal(fake.gaps.length, 1);
});
