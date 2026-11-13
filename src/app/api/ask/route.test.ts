import test from 'node:test';
import assert from 'node:assert/strict';
import { askResponseBody } from '@/lib/ask-response';
import { POST } from './route';

const request = () => new Request('http://localhost/api/ask', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ question: 'who owes me?' }),
});

test('the route gate answers 404 when the AI flag is off', async () => {
  const res = await POST(request() as never);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not found' });
});

test('the response puts destination beside template, not inside it', () => {
  const body = askResponseBody({
    reply: 'Two are unpaid.',
    messageId: '11111111-1111-4111-8111-111111111111',
    template: { id: 'list.ranked', props: { eyebrow: 'Who owes you' } },
    destination: { screen: 'Invoices · unpaid', path: '/invoices?filter=unpaid' },
    fallback: 'Two are unpaid.',
    tool: null,
    pending: null,
  });

  assert.deepEqual(body.destination, {
    screen: 'Invoices · unpaid',
    path: '/invoices?filter=unpaid',
  });
  assert.ok(body.template);
  assert.equal(
    Object.prototype.hasOwnProperty.call(body.template, 'destination'),
    false,
    'destination is not nested in template',
  );
});
