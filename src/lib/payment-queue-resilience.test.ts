// The pending-payment banner is optional; the invoice screen is not. On iOS
// Safari a PWA can be denied IndexedDB (blocked storage, a private window, a
// corrupted database) or stall opening it. None of that may take the invoice
// down: the queue read has to answer quickly, and answer "nothing to show" when
// it cannot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetPaymentQueueStore,
  createMemoryQueueStore,
  loadQueuedForInvoice,
  paymentQueueStore,
  type QueueStore,
} from './payment-queue';

const NEVER = () => new Promise<never>(() => {});

test('a throwing IndexedDB never throws out of the queue', async () => {
  const g = globalThis as { indexedDB?: unknown };
  const prev = g.indexedDB;
  // Safari private mode / blocked storage: open() throws synchronously.
  g.indexedDB = { open: () => { throw new Error('SecurityError: storage blocked'); } };
  __resetPaymentQueueStore();
  try {
    const store = paymentQueueStore(); // constructing must never throw
    if (store) {
      // The throw surfaces on the first read, which the loader absorbs.
      assert.deepEqual(await loadQueuedForInvoice(store, 'user-a', 'inv-1', 200), { ok: false });
    }
  } finally {
    g.indexedDB = prev;
    __resetPaymentQueueStore();
  }
});

test('a store that throws reads as "nothing queued"', async () => {
  const broken: QueueStore = {
    list: async () => { throw new Error('db is gone'); },
    put: async () => {},
    remove: async () => {},
  };
  const res = await loadQueuedForInvoice(broken, 'user-a', 'inv-1', 200);
  assert.deepEqual(res, { ok: false });
});

test('a store that never answers gives up quickly instead of hanging the screen', async () => {
  const slow: QueueStore = { list: NEVER, put: NEVER, remove: NEVER };
  const started = Date.now();
  const res = await loadQueuedForInvoice(slow, 'user-a', 'inv-1', 100);
  const took = Date.now() - started;
  assert.deepEqual(res, { ok: false });
  assert.ok(took < 1500, `gave up in ${took}ms`);
});

test('an empty queue is a success with no entries', async () => {
  const store = createMemoryQueueStore();
  assert.deepEqual(await loadQueuedForInvoice(store, 'user-a', 'inv-1', 200), { ok: true, entries: [] });
});

test('only this invoice and this user reach the banner', async () => {
  const store = createMemoryQueueStore([
    { key: 'k1', invoiceId: 'inv-1', userId: 'user-a', amount: 50, method: 'cash', paidAt: '2026-01-01', createdAt: 1, attempts: 0, status: 'pending' },
    { key: 'k2', invoiceId: 'inv-2', userId: 'user-a', amount: 70, method: 'cash', paidAt: '2026-01-01', createdAt: 2, attempts: 0, status: 'pending' },
    { key: 'k3', invoiceId: 'inv-1', userId: 'user-b', amount: 90, method: 'cash', paidAt: '2026-01-01', createdAt: 3, attempts: 0, status: 'pending' },
  ]);
  const res = await loadQueuedForInvoice(store, 'user-a', 'inv-1', 200);
  assert.equal(res.ok, true);
  assert.deepEqual(res.ok ? res.entries.map((e) => e.key) : [], ['k1']);
});
