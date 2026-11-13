import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { OWNER } from '@/lib/tools/pglite-test-db';
import { handleFeedback, POST } from './route';

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ask/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ALLOW = { limit: async () => true, identify: () => 'user:test' };

test('the AI flag gate answers 404 before auth or a write', async () => {
  const res = await POST(request({ messageId: MESSAGE_ID, thumb: 'up' }));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not found' });
});

test('a limited caller gets 429 after auth', async () => {
  const calls: string[] = [];
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: OWNER } }, error: null }),
    },
  };
  const guards = {
    limit: async (route: string, identifier: string) => {
      calls.push(`${route}:${identifier}`);
      return false;
    },
    identify: (_req: NextRequest, userId: string) => `user:${userId}`,
  };

  const res = await handleFeedback(
    request({ messageId: MESSAGE_ID, thumb: 'up' }),
    supabase as never,
    guards as never,
  );

  assert.equal(res.status, 429);
  assert.deepEqual(calls, [`parse:user:${OWNER}`]);
  assert.deepEqual(await res.json(), { reply: 'One sec — slow down a moment.' });
});

test("a signed-in user cannot vote on another owner's message", async () => {
  let filters: Record<string, unknown> = {};
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: OWNER } }, error: null }),
    },
    from(table: string) {
      assert.equal(table, 'chat_messages', 'the route checks ownership before writing');
      const chain = {
        select: () => chain,
        eq(column: string, value: unknown) {
          filters = { ...filters, [column]: value };
          return chain;
        },
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    },
  };

  const res = await handleFeedback(
    request({ messageId: MESSAGE_ID, thumb: 'up' }),
    supabase as never,
    ALLOW as never,
  );

  assert.equal(res.status, 403);
  assert.deepEqual(filters, { id: MESSAGE_ID, user_id: OWNER });
  assert.deepEqual(await res.json(), {
    error: 'not_found',
    reply: 'That message is not available.',
  });
});
