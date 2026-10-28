#!/usr/bin/env node
// ═══ One-off backfill: verify quote attachments that were never hashed ═══════
//
// Until the Chat builder started using the estimate upload routes, an estimate
// attachment added there was a bare invoice_attachments row: no mime_type, no
// size_bytes, no checksum. The public /e page (and estimate_content_hash) accept
// a row only when its verification columns are present, so those pictures never
// reached the client page. This script repairs the EXISTING rows the same way
// the confirm route would have: download the stored object with the service
// role, detect the type from its bytes, hash it, and write the three columns.
//
// What it touches: invoice_attachments rows whose parent invoices.kind = 'quote'
// and whose checksum IS NULL. Nothing else. It never uploads, deletes, renames
// an object or changes a row that already has a checksum.
//
// Safety
//   • Dry run by default: prints the row count and every planned value, writes
//     nothing. `--apply` is required to write.
//   • Idempotent: the target is "checksum is null", and each UPDATE is guarded
//     by `.is('checksum', null)`, so a re-run finds nothing and a concurrent
//     confirm still wins. Verified rows are never rewritten.
//   • Skips (and logs) a row whose object is missing/unreadable, whose bytes are
//     not JPG/PNG/PDF (HEIC included), whose object is over the 10 MB cap, or
//     whose storage_path is not under the row's own `${user_id}/${invoice_id}/`
//     folder (such a row can never be published even with a checksum).
//   • A signed (approved) estimate is flagged: attaching a file after signing
//     changes estimate_content_hash, which the signature recorded. The row is
//     still repaired — the page needs it — but the warning says so.
//
// Env (never printed):
//   SUPABASE_SERVICE_ROLE_KEY   required — service role, bypasses RLS
//   SUPABASE_URL                the project URL
//     (falls back to NEXT_PUBLIC_SUPABASE_URL, e.g. from a populated .env)
//
// Run (the app's TS modules resolve through the project's test loader):
//   node --import ./scripts/test-register.mjs scripts/backfill-quote-attachment-checksums.mjs
//   node --import ./scripts/test-register.mjs scripts/backfill-quote-attachment-checksums.mjs --apply
//
// Example dry-run output:
//   [dry-run] quote attachment rows with no checksum: 2
//     ✓ E-0042  1f0c…9a  image/jpeg   240118 bytes  sha256 9d2f…c41e  (5f1b…08)
//     ✗ E-0037  b7a1…44  skipped: unsupported_type (bytes are not JPG/PNG/PDF)
//   [dry-run] would update 1, skipped 1. Nothing written — re-run with --apply.
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { validateAttachmentBytes } from '@/lib/estimates/file-type';
import { ATTACHMENT_BUCKET } from '@/lib/estimates/limits';

const PAGE = 500;
const ID_CHUNK = 200;
const INVOICE_NUMBER = (n) => `E-${String(Number.isFinite(n) ? n : 0).padStart(4, '0')}`;
const short = (s, n = 8) => (s ? `${s.slice(0, n)}…${s.slice(-4)}` : '—');

const apply = process.argv.includes('--apply');
const help = process.argv.includes('--help') || process.argv.includes('-h');

if (help) {
  console.log(
    [
      'Backfill verification columns on quote attachments that have no checksum.',
      '',
      'Usage:',
      '  node --import ./scripts/test-register.mjs scripts/backfill-quote-attachment-checksums.mjs           # dry run',
      '  node --import ./scripts/test-register.mjs scripts/backfill-quote-attachment-checksums.mjs --apply   # write',
      '',
      'Env: SUPABASE_SERVICE_ROLE_KEY (required), SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.',
    ].join('\n'),
  );
  process.exit(0);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !serviceKey) {
  console.error(
    'Missing env: set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Values are read from the environment only; nothing is written to disk.',
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Every attachment row with no checksum (all kinds; the parent filter is next). */
async function loadUnverifiedRows() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('invoice_attachments')
      .select('id, invoice_id, user_id, storage_path, mime_type, size_bytes, checksum, position')
      .is('checksum', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`attachment read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/** Parent invoices, in id chunks, so we only ever plan rows whose parent is a quote. */
async function loadParents(invoiceIds) {
  const map = new Map();
  for (let i = 0; i < invoiceIds.length; i += ID_CHUNK) {
    const chunk = invoiceIds.slice(i, i + ID_CHUNK);
    const { data, error } = await admin
      .from('invoices')
      .select('id, kind, invoice_number, approved_at, deleted_at, revoked_at')
      .in('id', chunk);
    if (error) throw new Error(`invoice read failed: ${error.message}`);
    for (const row of data ?? []) map.set(row.id, row);
  }
  return map;
}

/** What the confirm route would write for this object, or the reason it can't. */
async function planFor(row) {
  const prefix = `${row.user_id}/${row.invoice_id}/`;
  if (typeof row.storage_path !== 'string' || !row.storage_path.startsWith(prefix) || row.storage_path.length <= prefix.length) {
    return { skip: 'storage_path is not under this owner/estimate folder' };
  }

  const { data: blob, error } = await admin.storage.from(ATTACHMENT_BUCKET).download(row.storage_path);
  if (error || !blob) return { skip: `object not readable (${error?.message ?? 'no blob'})` };

  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Same check the confirm route runs: the bytes decide the type, never a name.
  const valid = validateAttachmentBytes(bytes);
  if (!valid.ok) return { skip: `${valid.code} (bytes are not JPG/PNG/PDF or are too large)` };

  return {
    mime: valid.mime,
    sizeBytes: valid.sizeBytes,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  };
}

try {
  const all = await loadUnverifiedRows();
  const parents = await loadParents([...new Set(all.map((r) => r.invoice_id))]);
  const targets = all.filter((r) => parents.get(r.invoice_id)?.kind === 'quote');

  console.log(
    `${apply ? '[apply]' : '[dry-run]'} quote attachment rows with no checksum: ${targets.length}` +
      (all.length !== targets.length ? ` (of ${all.length} unverified rows overall)` : ''),
  );

  let planned = 0;
  let skipped = 0;
  let written = 0;
  let failed = 0;
  let signedTouched = 0;

  for (const row of targets) {
    const parent = parents.get(row.invoice_id);
    const label = INVOICE_NUMBER(parent?.invoice_number);

    let plan;
    try {
      plan = await planFor(row);
    } catch (e) {
      plan = { skip: `unexpected error: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (plan.skip) {
      skipped++;
      console.log(`  ✗ ${label}  ${short(row.id)}  skipped: ${plan.skip}`);
      continue;
    }

    planned++;
    const signedNote = parent?.approved_at ? '  ⚠ signed estimate — content hash will change' : '';
    const deadNote = parent?.deleted_at || parent?.revoked_at ? '  ⚠ parent deleted/revoked' : '';
    console.log(
      `  ✓ ${label}  ${short(row.id)}  ${plan.mime.padEnd(15)} ${String(plan.sizeBytes).padStart(8)} bytes  ` +
        `sha256 ${short(plan.checksum)}${signedNote}${deadNote}`,
    );
    if (signedNote) signedTouched++;

    if (!apply) continue;

    // Guarded by "checksum is null": a row another run (or the confirm route)
    // already verified is left exactly as it is.
    const { data, error } = await admin
      .from('invoice_attachments')
      .update({ mime_type: plan.mime, size_bytes: plan.sizeBytes, checksum: plan.checksum })
      .eq('id', row.id)
      .is('checksum', null)
      .select('id');
    if (error) {
      failed++;
      console.log(`    ! update failed for ${row.id}: ${error.message}`);
    } else if (!data?.length) {
      console.log(`    · ${row.id} was verified by someone else meanwhile — left alone`);
    } else {
      written++;
    }
  }

  if (apply) {
    console.log(`[apply] updated ${written}, skipped ${skipped}, failed ${failed}.`);
  } else {
    console.log(`[dry-run] would update ${planned}, skipped ${skipped}. Nothing written — re-run with --apply.`);
  }
  if (signedTouched) {
    console.log(
      `⚠ ${signedTouched} row(s) belong to a signed estimate: the page will now publish them, but the ` +
        'content hash stored with that signature no longer matches the estimate. Flagged, not blocked.',
    );
  }
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error(`backfill failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
