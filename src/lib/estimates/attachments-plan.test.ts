// Tiers: a non-Plus estimate gets created WITHOUT its new attachments — the
// send must not abort, and the count of what was skipped comes back typed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materializeEstimateAttachments } from './attachments-client';
import type { EditorAttachment } from '@/components/AttachmentsEditor';

/** Only the storage read a seed-time copy needs; every upload goes through
 *  global fetch, which each test stubs. */
const db: any = {
  storage: { from: () => ({ download: async () => ({ data: new Blob(['img']) }) }) },
};

function stubFetch(status: number, body: unknown): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

const items = (): EditorAttachment[] => [
  { id: 'a', previewUrl: 'blob:x', blob: new Blob(['x']) },
  { id: 'b', previewUrl: 'blob:y', blob: new Blob(['y']) },
];

test('estimate attachments: plan_required skips every upload and is not a failure', async () => {
  const restore = stubFetch(403, { error: 'plan_required' });
  try {
    const res = await materializeEstimateAttachments(db, 'est-1', items());
    assert.equal(res.failedId, undefined, 'the estimate is still created');
    assert.equal(res.attachmentsSkipped, 2);
    assert.equal(res.saved.size, 0);
    assert.deepEqual(res.items.map((i) => i.storagePath), [undefined, undefined]);
  } finally {
    restore();
  }
});

test('estimate attachments: a real failure still aborts the send', async () => {
  const restore = stubFetch(500, { error: 'presign_failed' });
  try {
    const res = await materializeEstimateAttachments(db, 'est-1', items());
    assert.equal(res.failedId, 'a');
    assert.equal(res.attachmentsSkipped, 0);
  } finally {
    restore();
  }
});

test('estimate attachments: flag off / Plus behaves as before (all saved)', async () => {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async (url: string) => {
    call++;
    if (String(url).includes('/presign')) {
      return new Response(JSON.stringify({ path: 'u/est-1/f.jpg', token: 't', signedUrl: 'https://storage.test/put' }), { status: 200 });
    }
    return new Response(JSON.stringify({ attachment: { id: `id-${call}`, position: call, mimeType: 'image/jpeg', sizeBytes: 1 } }), { status: 200 });
  }) as unknown as typeof fetch;
  // The signed PUT goes through XHR, which node has no implementation of.
  const xhr = (globalThis as any).XMLHttpRequest;
  (globalThis as any).XMLHttpRequest = class {
    upload = {};
    status = 200;
    onload: (() => void) | null = null;
    open() {}
    setRequestHeader() {}
    send() { this.onload?.(); }
  };
  try {
    const res = await materializeEstimateAttachments(db, 'est-1', items());
    assert.equal(res.failedId, undefined);
    assert.equal(res.attachmentsSkipped, 0);
    assert.equal(res.saved.size, 2);
  } finally {
    globalThis.fetch = original;
    (globalThis as any).XMLHttpRequest = xhr;
  }
});
