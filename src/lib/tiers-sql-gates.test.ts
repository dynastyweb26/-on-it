// The SQL gates' shape, read out of the migrations. The database can't run in a
// unit test, so these pin the parts that must never drift: the switch-off path
// is the old body exactly, the switch-on path asks is_plus(), the hints are the
// ones the client keys on, and each gate is as narrow as the spec says
// (INSERT only, no plan-alone, founder counts as Plus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const RECURRING = read('../../supabase/migrations/20261116110000_tiers_recurring_gate.sql');
const ATTACH_TRIGGER = read('../../supabase/migrations/20261116120000_tiers_attachment_trigger.sql');
const ATTACH_CHANGING = read('../../supabase/migrations/20261116120100_tiers_attachments_changing.sql');
const PRESIGN = read('../../src/app/api/estimates/[id]/attachments/presign/route.ts');
const CONFIRM = read('../../src/app/api/estimates/[id]/attachments/confirm/route.ts');
const INVOICE_CLIENT = read('../../src/lib/attachments-client.ts');

test('recurring: the switch-off branch is the old gate, hint included', () => {
  const off = RECURRING.slice(
    RECURRING.indexOf('if not public.tiers_enforced() then'),
    RECURRING.indexOf('if public.is_plus(NEW.user_id) then'),
  );
  assert.match(off, /select p\.access_tier into v_tier/);
  assert.match(off, /v_tier in \('founder', 'trialing', 'active', 'past_due'\)/);
  assert.match(off, /hint = 'PAYWALL_RECURRING'/);
  assert.doesNotMatch(off, /is_plus|PLAN_RECURRING/);
});

test('recurring: with tiers on, is_plus decides and Pro gets its own hint', () => {
  const on = RECURRING.slice(RECURRING.indexOf('if public.is_plus(NEW.user_id) then'));
  assert.match(on, /return NEW;/, 'a Plus user (and a founder) passes');
  assert.match(on, /hint = 'PLAN_RECURRING'/);
  assert.match(on, /hint = 'PAYWALL_RECURRING'/, 'free and canceled keep the paywall hint');
  assert.ok(
    on.indexOf("hint = 'PLAN_RECURRING'") < on.indexOf("hint = 'PAYWALL_RECURRING'"),
    'the Pro hint is the paid-but-not-Plus case, checked first',
  );
});

test('recurring: still BEFORE INSERT only, so existing items keep running', () => {
  assert.match(RECURRING, /before insert on public\.recurring_expenses/);
  assert.doesNotMatch(RECURRING, /before update|before delete|after insert|after update/);
  assert.match(
    RECURRING,
    /revoke execute on function public\.enforce_paid_recurring_expenses\(\) from public, anon, authenticated/,
  );
});

test('recurring: the trigger and function are re-asserted, not left to chance', () => {
  assert.match(RECURRING, /drop trigger if exists enforce_paid_recurring_expenses/);
  assert.match(RECURRING, /execute function public\.enforce_paid_recurring_expenses\(\)/);
});

// ── Attachments: the row gate is INSERT only, and Plus decides ───────────

test('attachments: the gate allows when tiers are off or the user is Plus', () => {
  const body = ATTACH_TRIGGER.slice(ATTACH_TRIGGER.indexOf('create or replace function'));
  assert.match(
    body,
    /if not public\.tiers_enforced\(\) or public\.is_plus\(NEW\.user_id\) then/,
  );
  assert.match(body, /hint = 'PLAN_ATTACHMENTS'/);
  // No storage_path exception: a row is a new attachment.
  assert.doesNotMatch(body, /storage_path/);
});

test('attachments: BEFORE INSERT only, so existing rows view, reorder and delete', () => {
  assert.match(ATTACH_TRIGGER, /before insert on public\.invoice_attachments/);
  assert.doesNotMatch(ATTACH_TRIGGER, /before update|before delete|after insert|after update|after delete/);
});

test('reorder: one SECURITY DEFINER function, authenticated only, no row writes', () => {
  const fn = ATTACH_CHANGING.slice(
    ATTACH_CHANGING.indexOf('create or replace function public.reorder_invoice_attachments'),
    ATTACH_CHANGING.indexOf('revoke execute on function public.reorder_invoice_attachments'),
  );
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path = ''/);
  assert.match(fn, /auth\.uid\(\)/, 'the caller owns the invoice');
  assert.match(fn, /update public\.invoice_attachments a/);
  assert.match(fn, /set position = t\.ord - 1/);
  assert.match(fn, /set constraints public\.invoice_attachments_invoice_id_position_key deferred/);
  assert.doesNotMatch(fn, /insert into/i, 'a reorder never becomes a new attachment');
  assert.doesNotMatch(fn, /delete from/i);
  // Locked estimates keep their order even though the client-role guard is
  // skipped for a definer function.
  assert.match(fn, /approved_at is not null/);
  assert.match(fn, /converted_from/);
  // The unique constraint has to be deferrable for the one-statement rewrite.
  assert.match(ATTACH_CHANGING, /unique \(invoice_id, position\) deferrable initially immediate/);
  assert.match(
    ATTACH_CHANGING,
    /grant execute on function public\.reorder_invoice_attachments\(uuid, uuid\[\]\) to authenticated/,
  );
  assert.match(
    ATTACH_CHANGING,
    /revoke execute on function public\.reorder_invoice_attachments\(uuid, uuid\[\]\) from public, anon/,
  );
});

test('estimate commit: the Plus check runs before any row is written', () => {
  const fn = ATTACH_CHANGING.slice(ATTACH_CHANGING.indexOf('create or replace function public.add_estimate_attachment'));
  const check = fn.indexOf('if public.tiers_enforced() and not public.is_plus(p_user_id) then');
  const insert = fn.indexOf('insert into public.invoice_attachments');
  assert.ok(check > 0, 'the plan check is in add_estimate_attachment');
  assert.ok(check < insert, 'a refused plan writes nothing');
  assert.match(fn.slice(check, insert), /'code', 'plan_required'/);
  // The switch off is today's body: the row checks below are unchanged.
  assert.match(fn, /'code', 'locked'/);
  assert.match(fn, /'code', 'too_many'/);
  assert.match(fn, /grant execute on function public\.add_estimate_attachment\(\n  uuid, uuid, text, text, bigint, text\n\) to service_role/);
});

test('estimate uploads: presign gates a NEW file, confirm maps the refusal', () => {
  assert.match(PRESIGN, /if \(NEXT_PUBLIC_TIERS && !\(await currentPlanIsPlus\(supabase, user\.id\)\)\)/);
  assert.match(PRESIGN, /refuse\(403, 'plan_required'\)/);
  // The presign gate is before any signed URL is minted.
  const gate = PRESIGN.indexOf('currentPlanIsPlus');
  const mint = PRESIGN.indexOf('createSignedUploadUrl');
  assert.ok(gate > 0 && gate < mint, 'a refused plan creates no upload slot');
  assert.match(CONFIRM, /case 'plan_required':/);
  assert.match(CONFIRM, /refuse\(403, 'plan_required'\)/);
});

test('invoice reorder: the client calls the RPC and never touches the table', () => {
  const fn = INVOICE_CLIENT.slice(
    INVOICE_CLIENT.indexOf('export async function renumberAttachments'),
    INVOICE_CLIENT.indexOf('export const ATTACHMENT_LOAD_ERROR'),
  );
  assert.match(fn, /rpc\('reorder_invoice_attachments'/);
  assert.doesNotMatch(fn, /\.delete\(/);
  assert.doesNotMatch(fn, /\.insert\(/);
  assert.doesNotMatch(fn, /\.update\(/);
});
