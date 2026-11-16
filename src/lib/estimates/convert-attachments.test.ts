// TIERS-SPEC.md rule 4 (keep what exists, gate what is new) and design/tiers 05:
// when a non-Plus user converts an estimate or revises a document, the copy is
// made WITHOUT the photos and the result says how many, and which document kept
// them. A skipped copy is never a failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copyAttachmentsOutcome } from '@/lib/attachments-client';

type Source = { kind: string | null; invoice_number: number | null } | null;

/** Enough of the Supabase surface for the copy path, with a source row and the
 *  row trigger's plan refusal (PLAN_ATTACHMENTS). */
function fakeDb(
  source: Source,
  opts: { rows?: { id: string; position: number }[]; planRefusal?: boolean; failUpload?: boolean } = {},
) {
  const rows = opts.rows ?? [{ id: 'r1', position: 0 }, { id: 'r2', position: 1 }];
  let inserted = 0;
  const row = (r: { id: string; position: number }) => ({
    id: r.id,
    storage_path: `u/src/${r.position}.jpg`,
    position: r.position,
  });

  const from = (table: string) => {
    if (table === 'invoices') {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: source }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: source }).then(res),
      };
      return q;
    }
    const q: any = {
      select: () => q,
      eq: () => q,
      order: async () => ({ data: rows.map(row) }),
      insert: (payload: any) => {
        q._payload = payload;
        return q;
      },
      single: async () => {
        // The row trigger's plan refusal, read off PostgREST's hint.
        if (opts.planRefusal) {
          return { data: null, error: { hint: 'PLAN_ATTACHMENTS', message: 'Attachments need Plus' } };
        }
        inserted++;
        return { data: { id: `n${inserted}`, storage_path: q._payload.storage_path, position: q._payload.position }, error: null };
      },
      delete: () => q,
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null }).then(res),
    };
    return q;
  };

  return {
    from,
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob(['img']) }),
        upload: async () => ({ error: opts.failUpload ? { message: 'nope' } : null }),
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `signed:${path}` } }),
        remove: async () => ({ error: null }),
      }),
    },
  } as any;
}

test('convert: a plan refusal still creates the invoice, and says what was skipped', async () => {
  const report = await copyAttachmentsOutcome(
    fakeDb({ kind: 'quote', invoice_number: 51 }, { planRefusal: true }),
    'u', 'source', 'new-invoice',
  );
  assert.equal(report.ok, true, 'a refused copy is not a failure');
  assert.equal(report.copied, 0);
  assert.deepEqual(report.skipped, { count: 2, sourceDocNumber: 'E-0051' });
});

test('convert: an invoice source names itself formatted, never a stored kind', async () => {
  const report = await copyAttachmentsOutcome(
    fakeDb({ kind: 'invoice', invoice_number: 7 }, { planRefusal: true }),
    'u', 'source', 'new-invoice',
  );
  assert.deepEqual(report.skipped, { count: 2, sourceDocNumber: 'INV-0007' });
});

test('revise: a Plus copy skips nothing and reads no source number', async () => {
  const report = await copyAttachmentsOutcome(
    fakeDb({ kind: 'quote', invoice_number: 51 }, { rows: [] }),
    'u', 'source', 'new-invoice',
  );
  assert.deepEqual(report, { ok: true, copied: 0, skipped: { count: 0, sourceDocNumber: null } });
});

test('convert: a real upload failure is still a failure, with nothing skipped', async () => {
  const report = await copyAttachmentsOutcome(
    fakeDb({ kind: 'quote', invoice_number: 51 }, { failUpload: true }),
    'u', 'source', 'new-invoice',
  );
  assert.deepEqual(report, { ok: false, copied: 0, skipped: { count: 0, sourceDocNumber: null } });
});

test('convert: an unreadable source row keeps the count, drops the number', async () => {
  const report = await copyAttachmentsOutcome(
    fakeDb(null, { planRefusal: true }),
    'u', 'source', 'new-invoice',
  );
  assert.deepEqual(report.skipped, { count: 2, sourceDocNumber: null });
});

test('wiring: convert returns the skipped count and its source document', () => {
  const CONVERT = readFileSync(new URL('./convert-client.ts', import.meta.url), 'utf8');
  // The copy is reported, not just counted: count + source doc number.
  assert.match(CONVERT, /copyAttachmentsOutcome\(supabase, est\.user_id, est\.id, created\.id\)/);
  assert.match(CONVERT, /attachmentsSkipped: copy\.skipped/);
  // The already-converted path copied nothing.
  assert.match(CONVERT, /attachmentsSkipped: \{ count: 0, sourceDocNumber: null \}/);
  // The source's own number is read with the copy (selected, never guessed).
  assert.match(CONVERT, /invoice_number/);
  // No copy still fails the document: a plan refusal is an ok conversion.
  assert.match(CONVERT, /if \(!copy\.ok\) \{/);
});
