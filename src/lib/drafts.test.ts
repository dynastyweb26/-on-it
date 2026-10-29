import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_TTL_MS, clearAllDrafts, clearDraft, draftKey, handleDraftAuthChange,
  hasDraftContent, readDraft, saveDraft,
} from './drafts';
import { configureCacheStorage, resetCacheStorage, type CacheStorage } from './cache';

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
const client = { name: 'Ada Lovelace', phone: '555-0100', email: '', address: '', notes: 'gate code 4' };

afterEach(() => resetCacheStorage());

test('A drafts, signs out, and B sees nothing', () => {
  const storage = memoryStorage();
  configureCacheStorage(storage);

  saveDraft(A, 'client:new', client);
  assert.deepEqual(readDraft<typeof client>(A, 'client:new')?.v, client);

  // The one sign-out call, shared with the cache.
  handleDraftAuthChange('SIGNED_OUT');
  assert.equal(readDraft<typeof client>(A, 'client:new'), null);
  assert.deepEqual(storage.dump(), {});

  // B signs in on the same device.
  assert.equal(readDraft<typeof client>(B, 'client:new'), null);
  saveDraft(B, 'client:new', { ...client, name: 'Grace Hopper' });
  assert.deepEqual(readDraft<typeof client>(B, 'client:new')?.v.name, 'Grace Hopper');
  assert.equal(readDraft<typeof client>(A, 'client:new'), null);
});

test('drafts are keyed per user and per form', () => {
  configureCacheStorage(memoryStorage());
  saveDraft(A, 'client:new', client);
  saveDraft(A, 'client:abc', { ...client, name: 'Edit screen' });
  assert.equal(readDraft<typeof client>(A, 'client:new')?.v.name, 'Ada Lovelace');
  assert.equal(readDraft<typeof client>(A, 'client:abc')?.v.name, 'Edit screen');
  assert.equal(readDraft<typeof client>(B, 'client:new'), null);
  assert.equal(readDraft<typeof client>(A, 'product:new'), null);
});

test('a draft carries a timestamp, and an old one is dropped', () => {
  const storage = memoryStorage();
  configureCacheStorage(storage);
  const before = Date.now();
  saveDraft(A, 'client:new', client);
  const entry = readDraft<typeof client>(A, 'client:new');
  assert.ok(entry && entry.at >= before && entry.at <= Date.now());

  storage.setItem(draftKey(A, 'client:new'), JSON.stringify({ v: client, at: Date.now() - DRAFT_TTL_MS - 1 }));
  assert.equal(readDraft<typeof client>(A, 'client:new'), null);
  assert.equal(storage.dump()[draftKey(A, 'client:new')], undefined);
});

test('clearDraft removes one form and leaves the others', () => {
  configureCacheStorage(memoryStorage());
  saveDraft(A, 'client:new', client);
  saveDraft(A, 'product:new', { name: 'Deck stain' });
  clearDraft(A, 'client:new');
  assert.equal(readDraft(A, 'client:new'), null);
  assert.deepEqual(readDraft<object>(A, 'product:new')?.v, { name: 'Deck stain' });
});

test('token refresh keeps drafts; sign-out clears them', () => {
  configureCacheStorage(memoryStorage());
  saveDraft(A, 'client:new', client);
  handleDraftAuthChange('TOKEN_REFRESHED');
  assert.ok(readDraft(A, 'client:new'));
  handleDraftAuthChange('SIGNED_OUT');
  assert.equal(readDraft(A, 'client:new'), null);
});

test('an empty form is not worth drafting', () => {
  assert.equal(hasDraftContent({ name: '', phone: '   ', address: '' }), false);
  assert.equal(hasDraftContent({ name: '', phone: '555' }), true);
  assert.equal(hasDraftContent({ colors: [] }), false);
  assert.equal(hasDraftContent({ colors: ['#fff'] }), true);
  assert.equal(hasDraftContent(null), false);
});

test('corrupt JSON and blocked storage never throw', () => {
  const storage = memoryStorage();
  configureCacheStorage(storage);
  storage.setItem(draftKey(A, 'client:new'), '{oops');
  assert.equal(readDraft(A, 'client:new'), null);

  configureCacheStorage({
    length: 0, key: () => null,
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('blocked'); },
  });
  saveDraft(A, 'client:new', client);
  assert.equal(readDraft(A, 'client:new'), null);
  clearAllDrafts();
  clearDraft(A, 'client:new');
});
