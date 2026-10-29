// ═══ Offline payment queue (record payment only) ═══
//
// A recorded payment is money. This queue exists so a payment typed on a dead
// connection is not simply lost — but it is deliberately conservative:
//
//   - It NEVER shows the invoice as paid. The invoice keeps its balance and
//     shows "Payment pending: $X" until the server confirms the row.
//   - Every entry reuses the idempotency key minted at the tap, so a retry
//     (including one after the app was killed mid-request) can only ever write
//     ONE ledger row. The server's partial unique index does the rest.
//   - FIFO, one at a time. The first network failure stops the run and keeps the
//     order; nothing is reordered or skipped.
//   - The queue is NOT cleared on sign-out. It is per user: another account can
//     neither see nor sync it.
//   - A queued payment the server later refuses (e.g. the overpayment guard,
//     because another payment landed first) moves to "Needs attention" with the
//     reason. It is never dropped silently and never deleted by expiry either.
//
// The store is injected so the rules can be tested without a browser. The real
// one is IndexedDB (below); tests use the in-memory one.

export const QUEUE_MAX = 10;
export const QUEUE_TTL_MS = 7 * 24 * 60 * 60_000;

export type QueuedStatus = 'pending' | 'attention';

export interface QueuedPayment {
  /** The idempotency key from the tap. Never regenerated. */
  key: string;
  invoiceId: string;
  userId: string;
  amount: number;
  method: string;
  paidAt: string;
  /** When it was queued (ms). Drives FIFO order and the 7-day expiry. */
  createdAt: number;
  attempts: number;
  status: QueuedStatus;
  /** Why it needs attention (mapped user copy, never a raw server message). */
  reason?: string;
}

export interface QueueStore {
  list(userId: string): Promise<QueuedPayment[]>;
  put(entry: QueuedPayment): Promise<void>;
  remove(key: string): Promise<void>;
}

export type SendResult =
  | { ok: true }
  | { ok: false; kind: 'network' }
  | { ok: false; kind: 'rejected'; reason: string };

export const EXPIRED_REASON =
  'This payment is over a week old. Check whether it went through, then retry or discard it.';

/**
 * Queue one payment. A double tap resolves to ONE entry: the same idempotency
 * key overwrites rather than appending.
 */
export async function enqueuePayment(
  store: QueueStore,
  entry: Omit<QueuedPayment, 'createdAt' | 'attempts' | 'status'>,
  now = Date.now(),
): Promise<'queued' | 'capped'> {
  const mine = (await store.list(entry.userId)).filter((e) => e.userId === entry.userId);
  const pending = mine.filter((e) => e.status === 'pending');
  const duplicate = pending.find((e) => e.key === entry.key);
  if (duplicate) {
    await store.put({ ...duplicate, ...entry, createdAt: duplicate.createdAt });
    return 'queued';
  }
  if (pending.length >= QUEUE_MAX) return 'capped';
  await store.put({ ...entry, createdAt: now, attempts: 0, status: 'pending' });
  return 'queued';
}

/** This user's entries, oldest first. Other users are never returned. */
export async function queuedFor(store: QueueStore, userId: string): Promise<QueuedPayment[]> {
  return (await store.list(userId))
    .filter((e) => e.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export interface SyncOutcome {
  sent: number;
  rejected: number;
  expired: number;
  /** True when a network failure stopped the run (the rest stay queued). */
  stopped: boolean;
}

/**
 * Send queued payments oldest-first until one of them fails the network.
 * Rejected payments stay in the queue as `attention`; sent ones are removed.
 */
export async function syncPaymentQueue({
  store, userId, send, now = Date.now(),
}: {
  store: QueueStore;
  userId: string;
  send: (entry: QueuedPayment) => Promise<SendResult>;
  now?: number;
}): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { sent: 0, rejected: 0, expired: 0, stopped: false };
  const all = await queuedFor(store, userId);

  const pending: QueuedPayment[] = [];
  for (const entry of all) {
    if (entry.status !== 'pending') continue;
    if (now - entry.createdAt > QUEUE_TTL_MS) {
      // Expiry is not deletion: the user still has to decide.
      await store.put({ ...entry, status: 'attention', reason: EXPIRED_REASON });
      outcome.expired += 1;
      continue;
    }
    pending.push(entry);
  }

  for (const entry of pending) {
    const attempt = { ...entry, attempts: entry.attempts + 1 };
    await store.put(attempt); // count the attempt before the request, so a crash still records it
    let result: SendResult;
    try {
      result = await send(attempt);
    } catch (e) {
      console.error('[payment-queue] send threw', e);
      result = { ok: false, kind: 'network' };
    }
    if (result.ok) {
      await store.remove(entry.key);
      outcome.sent += 1;
      continue;
    }
    if (result.kind === 'network') {
      outcome.stopped = true;
      break;
    }
    await store.put({ ...attempt, status: 'attention', reason: result.reason });
    outcome.rejected += 1;
  }
  return outcome;
}

// ── IndexedDB store ─────────────────────────────────────────────────────────
// One database, one object store, keyed by the payment key. Every read filters
// by userId — the queue is per account even on a shared device, and sign-out
// leaves it alone (it is money, not cache).

const DB_NAME = 'onit-payments';
const DB_VERSION = 1;
const STORE = 'payment-queue';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'key' });
        s.createIndex('userId', 'userId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

/** The real browser store, or null where IndexedDB does not exist (SSR). */
export function createIdbQueueStore(): QueueStore | null {
  if (typeof indexedDB === 'undefined') return null;
  return {
    list: async (userId) => {
      const rows = await tx<QueuedPayment[]>('readonly', (s) => s.index('userId').getAll(userId) as IDBRequest<QueuedPayment[]>);
      return Array.isArray(rows) ? rows : [];
    },
    put: async (entry) => { await tx('readwrite', (s) => s.put(entry)); },
    remove: async (key) => { await tx('readwrite', (s) => s.delete(key)); },
  };
}

/** One IndexedDB store per tab (null where IndexedDB does not exist). */
let idbStore: QueueStore | null | undefined;
export function paymentQueueStore(): QueueStore | null {
  if (idbStore === undefined) idbStore = createIdbQueueStore();
  return idbStore;
}

/** In-memory store: tests, and a graceful no-op where IndexedDB is missing. */
export function createMemoryQueueStore(seed: QueuedPayment[] = []): QueueStore & { dump(): QueuedPayment[] } {
  const rows = new Map(seed.map((e) => [e.key, { ...e }]));
  return {
    list: async (userId) => [...rows.values()].filter((e) => e.userId === userId).map((e) => ({ ...e })),
    put: async (entry) => { rows.set(entry.key, { ...entry }); },
    remove: async (key) => { rows.delete(key); },
    dump: () => [...rows.values()].map((e) => ({ ...e })),
  };
}
