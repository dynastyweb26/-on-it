import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CACHE_TTL, cacheKey, clearAllCache, clearUserCache, configureCacheStorage,
  handleAuthChange, readCache, readCacheEntry, resetCacheStorage, writeCache,
  type CacheStorage,
} from './cache';

// A stand-in for localStorage: same surface the cache uses, no browser.
function memoryStorage(): CacheStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    dump: () => Object.fromEntries(map),
  };
}

const A = 'user-a';
const B = 'user-b';

afterEach(() => resetCacheStorage());

test('the A → sign out → B flow: B sees none of A data', () => {
  const storage = memoryStorage();
  configureCacheStorage(storage);

  // A signs in and the invoices list is cached.
  writeCache(A, 'invoices', [{ id: 'inv-a', client_name: 'Alice' }], CACHE_TTL.invoices);
  assert.deepEqual(readCache(A, 'invoices'), [{ id: 'inv-a', client_name: 'Alice' }]);

  // A signs out: ONE call, the same one the auth listener makes.
  handleAuthChange('SIGNED_OUT');
  assert.equal(readCache(A, 'invoices'), null);
  assert.deepEqual(storage.dump(), {}, 'every cached entry is gone');

  // B signs in on the same device.
  writeCache(B, 'invoices', [{ id: 'inv-b', client_name: 'Bob' }], CACHE_TTL.invoices);
  assert.deepEqual(readCache(B, 'invoices'), [{ id: 'inv-b', client_name: 'Bob' }]);
  assert.equal(readCache(A, 'invoices'), null, 'A sees none of B, and A is empty');
});

test('entries are namespaced per user even without a clear', () => {
  configureCacheStorage(memoryStorage());
  writeCache(A, 'clients', ['Alice'], CACHE_TTL.lists);
  writeCache(B, 'clients', ['Bob'], CACHE_TTL.lists);
  assert.deepEqual(readCache(A, 'clients'), ['Alice']);
  assert.deepEqual(readCache(B, 'clients'), ['Bob']);
  assert.equal(readCache('user-c', 'clients'), null);
});

test('every entry carries a timestamp and an expiry', () => {
  configureCacheStorage(memoryStorage());
  const before = Date.now();
  writeCache(A, 'clients', ['Alice'], CACHE_TTL.lists);
  const entry = readCacheEntry<string[]>(A, 'clients');
  assert.ok(entry);
  assert.ok(entry!.at >= before && entry!.at <= Date.now());
  assert.equal(entry!.exp, entry!.at + CACHE_TTL.lists);
  assert.deepEqual(entry!.v, ['Alice']);
});

test('a stale entry is a miss and is removed', () => {
  const storage = memoryStorage();
  configureCacheStorage(storage);
  storage.setItem(cacheKey(A, 'invoices'), JSON.stringify({ v: ['old'], at: 1, exp: Date.now() - 1 }));
  assert.equal(readCache(A, 'invoices'), null);
  assert.equal(storage.dump()[cacheKey(A, 'invoices')], undefined);
});

test('corrupt JSON and a malformed entry are ignored, never thrown', () => {
  const storage = memoryStorage();
  configureCacheStorage(storage);
  storage.setItem(cacheKey(A, 'invoices'), '{not json');
  assert.equal(readCache(A, 'invoices'), null);
  storage.setItem(cacheKey(A, 'clients'), JSON.stringify({ v: ['x'] }));
  assert.equal(readCache(A, 'clients'), null);
});

test('token refresh keeps the cache; forced sign-out clears it', () => {
  configureCacheStorage(memoryStorage());
  writeCache(A, 'clients', ['Alice'], CACHE_TTL.lists);
  handleAuthChange('TOKEN_REFRESHED');
  assert.deepEqual(readCache(A, 'clients'), ['Alice']);
  handleAuthChange('SIGNED_OUT');
  assert.equal(readCache(A, 'clients'), null);
});

test('clearUserCache leaves the other account alone', () => {
  configureCacheStorage(memoryStorage());
  writeCache(A, 'clients', ['Alice'], CACHE_TTL.lists);
  writeCache(B, 'clients', ['Bob'], CACHE_TTL.lists);
  clearUserCache(A);
  assert.equal(readCache(A, 'clients'), null);
  assert.deepEqual(readCache(B, 'clients'), ['Bob']);
});

test('storage that throws never breaks a screen', () => {
  configureCacheStorage({
    length: 0, key: () => null,
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('blocked'); },
  });
  assert.equal(readCache(A, 'clients'), null);
  writeCache(A, 'clients', ['Alice'], CACHE_TTL.lists); // must not throw
  clearAllCache();
  clearUserCache(A);
  assert.equal(readCache(A, 'clients'), null);
});
