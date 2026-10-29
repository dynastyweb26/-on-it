import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPIRED_REASON, QUEUE_MAX, QUEUE_TTL_MS, createMemoryQueueStore, enqueuePayment,
  queuedFor, syncPaymentQueue, type QueuedPayment, type SendResult,
} from './payment-queue';

const A = 'user-a';
const B = 'user-b';

const payment = (key: string, userId = A, extra: Partial<QueuedPayment> = {}) => ({
  key, invoiceId: 'inv-1', userId, amount: 250, method: 'zelle',
  paidAt: '2026-10-29T04:00:00.000Z', ...extra,
});

test('offline enqueue, then a reconnect sync sends it and clears the queue', async () => {
  const store = createMemoryQueueStore();
  assert.equal(await enqueuePayment(store, payment('pay-1'), 1000), 'queued');
  assert.equal((await queuedFor(store, A)).length, 1);

  const sent: string[] = [];
  const out = await syncPaymentQueue({
    store, userId: A, now: 2000,
    send: async (e) => { sent.push(e.key); return { ok: true }; },
  });

  assert.deepEqual(out, { sent: 1, rejected: 0, expired: 0, stopped: false });
  assert.deepEqual(sent, ['pay-1']);
  assert.equal((await queuedFor(store, A)).length, 0);
});

test('a double tap queues one entry under the same key', async () => {
  const store = createMemoryQueueStore();
  await enqueuePayment(store, payment('pay-same'), 1000);
  await enqueuePayment(store, payment('pay-same'), 1200);
  const rows = await queuedFor(store, A);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].createdAt, 1000, 'the original queue time is kept');
});

test('FIFO: oldest first, and the first network failure stops the run in order', async () => {
  const store = createMemoryQueueStore();
  await enqueuePayment(store, payment('pay-1'), 1000);
  await enqueuePayment(store, payment('pay-2'), 2000);
  await enqueuePayment(store, payment('pay-3'), 3000);

  const attempts: string[] = [];
  const out = await syncPaymentQueue({
    store, userId: A, now: 5000,
    send: async (e): Promise<SendResult> => {
      attempts.push(e.key);
      // The connection dies during the second send.
      return e.key === 'pay-2' ? { ok: false, kind: 'network' } : { ok: true };
    },
  });

  assert.deepEqual(attempts, ['pay-1', 'pay-2'], 'pay-3 is never attempted out of order');
  assert.equal(out.stopped, true);
  assert.deepEqual((await queuedFor(store, A)).map((e) => e.key), ['pay-2', 'pay-3']);
});

test('a connection killed mid-request then retried writes exactly one ledger row', async () => {
  const store = createMemoryQueueStore();
  await enqueuePayment(store, payment('pay-lost'), 1000);

  // The server saw the first request but the response never arrived.
  const ledger: string[] = [];
  const flaky = async (e: QueuedPayment): Promise<SendResult> => {
    if (!ledger.includes(e.key)) ledger.push(e.key); // the idempotent write
    return { ok: false, kind: 'network' };
  };
  await syncPaymentQueue({ store, userId: A, now: 2000, send: flaky });
  assert.equal((await queuedFor(store, A)).length, 1);
  assert.equal((await queuedFor(store, A))[0].attempts, 1);

  // Retry after reconnect: same key, so the ledger still holds one row.
  const out = await syncPaymentQueue({
    store, userId: A, now: 3000,
    send: async (e) => { if (!ledger.includes(e.key)) ledger.push(e.key); return { ok: true }; },
  });
  assert.equal(out.sent, 1);
  assert.deepEqual(ledger, ['pay-lost']);
  assert.equal((await queuedFor(store, A)).length, 0);
});

test('a server rejection moves to Needs attention with the reason, never dropped', async () => {
  const store = createMemoryQueueStore();
  await enqueuePayment(store, payment('pay-reject'), 1000);
  const out = await syncPaymentQueue({
    store, userId: A, now: 2000,
    send: async () => ({ ok: false, kind: 'rejected', reason: 'That payment is more than the balance left.' }),
  });

  assert.deepEqual(out, { sent: 0, rejected: 1, expired: 0, stopped: false });
  const rows = await queuedFor(store, A);
  assert.equal(rows.length, 1, 'kept, not deleted');
  assert.equal(rows[0].status, 'attention');
  assert.equal(rows[0].reason, 'That payment is more than the balance left.');
  assert.equal(rows[0].amount, 250);
});

test('the cap refuses the eleventh queued payment', async () => {
  const store = createMemoryQueueStore();
  for (let i = 0; i < QUEUE_MAX; i += 1) {
    assert.equal(await enqueuePayment(store, payment(`pay-${i}`), 1000 + i), 'queued');
  }
  assert.equal(await enqueuePayment(store, payment('pay-over'), 2000), 'capped');
  assert.equal((await queuedFor(store, A)).length, QUEUE_MAX);
});

test('a week-old entry moves to Needs attention instead of sending', async () => {
  const store = createMemoryQueueStore();
  await enqueuePayment(store, payment('pay-old'), 1000);
  const sent: string[] = [];
  const out = await syncPaymentQueue({
    store, userId: A, now: 1000 + QUEUE_TTL_MS + 1,
    send: async (e) => { sent.push(e.key); return { ok: true }; },
  });

  assert.deepEqual(sent, []);
  assert.equal(out.expired, 1);
  const rows = await queuedFor(store, A);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'attention');
  assert.equal(rows[0].reason, EXPIRED_REASON);
});

test('user B can neither see nor sync user A queue', async () => {
  const store = createMemoryQueueStore();
  await enqueuePayment(store, payment('pay-a', A), 1000);

  assert.deepEqual(await queuedFor(store, B), []);
  const sentForB: string[] = [];
  const out = await syncPaymentQueue({
    store, userId: B, now: 2000,
    send: async (e) => { sentForB.push(e.key); return { ok: true }; },
  });
  assert.equal(out.sent, 0);
  assert.deepEqual(sentForB, []);
  assert.equal((await queuedFor(store, A)).length, 1, "A's payment is untouched");
});

test('a send that throws counts as the network, not as a rejection', async () => {
  const store = createMemoryQueueStore();
  await enqueuePayment(store, payment('pay-throw'), 1000);
  const out = await syncPaymentQueue({
    store, userId: A, now: 2000,
    send: async () => { throw new Error('boom'); },
  });
  assert.equal(out.stopped, true);
  assert.equal(out.rejected, 0);
  const rows = await queuedFor(store, A);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].attempts, 1);
});
