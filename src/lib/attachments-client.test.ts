// Pure helpers of the attachment storage layer: the next free position and the
// object path shape the bucket policy depends on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextAttachmentPosition, attachmentObjectPath, loadAttachmentCopies, materializeAttachments,
  type AttachmentRow,
} from './attachments-client';
import type { EditorAttachment } from '@/components/AttachmentsEditor';

test('nextAttachmentPosition: empty → 0, else max + 1', () => {
  assert.equal(nextAttachmentPosition([]), 0);
  assert.equal(nextAttachmentPosition([{ position: 0 }]), 1);
  assert.equal(nextAttachmentPosition([{ position: 0 }, { position: 1 }]), 2);
  // A gap still advances past the highest used slot.
  assert.equal(nextAttachmentPosition([{ position: 0 }, { position: 2 }]), 3);
  assert.equal(nextAttachmentPosition([{ position: 5 }]), 6);
});

test('attachmentObjectPath: ${uid}/${invoiceId}/${uuid}.jpg', () => {
  const p = attachmentObjectPath('user-1', 'inv-9');
  assert.match(p, /^user-1\/inv-9\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/);
});

test('attachmentObjectPath: two calls never collide', () => {
  assert.notEqual(attachmentObjectPath('u', 'i'), attachmentObjectPath('u', 'i'));
});

// ── Fake client: enough of the Supabase surface for the copy path. Records
//    every storage call and every row write so a test can prove the SOURCE is
//    never written to.
function fakeClient(sourceInvoiceId: string, sourceRows: AttachmentRow[], opts: { failUpload?: boolean } = {}) {
  const store = new Map<string, AttachmentRow[]>([[sourceInvoiceId, sourceRows.map((r) => ({ ...r }))]]);
  const storage: string[] = [];
  const inserts: { invoice_id: string; storage_path: string; position: number }[] = [];
  let seq = 0;

  function query(table: string) {
    const filters: Record<string, unknown> = {};
    let op: 'select' | 'insert' | 'delete' = 'select';
    let payload: any;
    const apply = () => {
      if (op === 'select') {
        const inv = filters.invoice_id as string;
        return { data: (store.get(inv) ?? []).slice().sort((a, b) => a.position - b.position) };
      }
      if (op === 'insert') {
        const row: AttachmentRow = { id: `n${++seq}`, storage_path: payload.storage_path, position: payload.position };
        store.set(payload.invoice_id, [...(store.get(payload.invoice_id) ?? []), row]);
        inserts.push({ invoice_id: payload.invoice_id, storage_path: payload.storage_path, position: payload.position });
        return { data: [row] };
      }
      store.set(filters.invoice_id as string, []);
      return { data: null };
    };
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters[c] = v; return q; },
      order: () => q,
      insert: (row: any) => { op = 'insert'; payload = row; return q; },
      delete: () => { op = 'delete'; return q; },
      single: () => Promise.resolve({ data: (apply().data as AttachmentRow[])[0] ?? null }),
      then: (res: any, rej: any) => Promise.resolve(apply()).then(res, rej),
    };
    return table && q;
  }

  const db: any = {
    from: (t: string) => query(t),
    storage: { from: () => ({
      upload: async (path: string) => { storage.push(`upload:${path}`); return opts.failUpload ? { error: { message: 'nope' } } : { error: null }; },
      download: async (path: string) => { storage.push(`download:${path}`); return { data: new Blob(['img']) }; },
      createSignedUrl: async (path: string) => { storage.push(`sign:${path}`); return { data: { signedUrl: `signed:${path}` } }; },
      remove: async (paths: string[]) => { storage.push(`remove:${paths.join(',')}`); return { error: null }; },
    }) },
  };
  return { db, store, storage, inserts, sourceInvoiceId };
}

const SRC = 'src-invoice';

test('loadAttachmentCopies: signed thumbnails (in order) + source path to copy', async () => {
  const { db } = fakeClient(SRC, [
    { id: 'r1', storage_path: 'u/src/1.jpg', position: 0 },
    { id: 'r2', storage_path: 'u/src/2.jpg', position: 1 },
  ]);
  const items = await loadAttachmentCopies(db, SRC);
  assert.deepEqual(items.map((i) => i.copyFromPath), ['u/src/1.jpg', 'u/src/2.jpg']);
  assert.deepEqual(items.map((i) => i.previewUrl), ['signed:u/src/1.jpg', 'signed:u/src/2.jpg']);
  assert.equal(items[0].storagePath, undefined, 'a copy is not yet saved under the new invoice');
});

test('materializeAttachments: duplicates into the NEW invoice, 0..n-1, source untouched', async () => {
  const { db, store, storage, inserts } = fakeClient(SRC, [
    { id: 'r1', storage_path: 'u/src/1.jpg', position: 0 },
    { id: 'r2', storage_path: 'u/src/2.jpg', position: 1 },
  ]);
  const copies = await loadAttachmentCopies(db, SRC);
  const res = await materializeAttachments(db, 'u', 'new-invoice', copies);

  assert.equal(res.failedId, undefined);
  assert.equal(res.saved.size, 2);
  assert.deepEqual(inserts.map((i) => i.position), [0, 1]);
  assert.ok(inserts.every((i) => i.invoice_id === 'new-invoice'));
  // New objects live under the new invoice's folder — never the source's path.
  assert.ok(storage.filter((s) => s.startsWith('upload:')).every((s) => s.includes('/new-invoice/')));
  assert.ok(storage.filter((s) => s.startsWith('download:')).every((s) => s.includes('/src/')));
  // The source is READ only: same rows, same ids, no file removal.
  assert.deepEqual(store.get(SRC)!.map((r) => r.id), ['r1', 'r2']);
  assert.ok(!storage.some((s) => s.startsWith('remove:')), 'no object removal on a copy');
  // Items now point at the new objects, no longer at the copy source.
  assert.equal(res.items[0].copyFromPath, undefined);
  assert.ok(res.items[0].storagePath?.includes('/new-invoice/'));
  assert.match(res.items[0].previewUrl, /^signed:.*\/new-invoice\//);
});

test('materializeAttachments: a failed copy stops with failedId and inserts nothing', async () => {
  const { db, inserts } = fakeClient(SRC, [{ id: 'r1', storage_path: 'u/src/1.jpg', position: 0 }], { failUpload: true });
  const copies = await loadAttachmentCopies(db, SRC);
  const res = await materializeAttachments(db, 'u', 'new-invoice', copies);
  assert.equal(res.failedId, copies[0].id);
  assert.equal(res.saved.size, 0);
  assert.equal(inserts.length, 0, 'nothing is inserted when the copy fails');
});

test('materializeAttachments: a picked blob uploads without touching storage.download', async () => {
  const { db, storage, inserts } = fakeClient(SRC, []);
  const item: EditorAttachment = { id: 'local', previewUrl: 'blob:x', blob: new Blob(['x']), width: 10, height: 10 };
  const res = await materializeAttachments(db, 'u', 'new-invoice', [item]);
  assert.equal(res.failedId, undefined);
  assert.deepEqual(inserts.map((i) => i.position), [0]);
  assert.ok(!storage.some((s) => s.startsWith('download:')));
});

test('materializeAttachments: already-saved items are left alone (no re-upload)', async () => {
  const { db, storage } = fakeClient(SRC, []);
  const item: EditorAttachment = { id: 'saved', previewUrl: 'signed:x', storagePath: 'u/new-invoice/old.jpg', rowId: 'row-1' };
  const res = await materializeAttachments(db, 'u', 'new-invoice', [item]);
  assert.equal(res.saved.size, 0);
  assert.equal(storage.length, 0, 'no storage traffic for an already-saved item');
});
