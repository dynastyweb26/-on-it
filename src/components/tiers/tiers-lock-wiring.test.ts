// design/tiers 04 (lock sheets) + 05 (photos skipped): how the screens wire
// them, proven from the source (the screens need Supabase to mount), plus the
// one decision the store owns: which plan sees a lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

test('flag off: the host is not mounted and the store opens nothing', () => {
  assert.match(read('src/components/app/AppShell.tsx'), /\{NEXT_PUBLIC_TIERS && <TiersHost \/>\}/);
  const store = read('src/components/tiers/store.ts');
  for (const fn of ['loadPlanTiers', 'lockFor', 'showPlanLock', 'openPlanLock', 'notePhotosSkipped', 'openPlanPaywall']) {
    const at = store.indexOf(`function ${fn}(`);
    assert.ok(at > 0, fn);
    assert.match(store.slice(at, at + 400), /!NEXT_PUBLIC_TIERS/, `${fn} is a no-op with the flag off`);
  }
});

test('every trigger opens the lock sheet: bank, new recurring, add photo', () => {
  const bank = read('src/components/bank/BankAccountsScreen.tsx');
  assert.match(bank, /if \(bankLock\) \{ showPlanLock\(bankLock\); return; \}/);
  assert.match(bank, /planLockFrom\('bank', body,/, 'the route’s typed refusal is the same sheet');
  assert.match(read('src/app/(app)/dashboard/recurring/page.tsx'), /if \(recurringLock\) \{ showPlanLock\(recurringLock\); return; \}/);
  assert.match(read('src/components/recurring/RecurringForm.tsx'), /planLockFromCode\('recurring', err\.hint/);
  assert.match(read('src/components/tabs/ChatView.tsx'), /planLockFromCode\('recurring', error\.hint/);
  assert.match(read('src/components/AttachmentsEditor.tsx'), /if \(photoLock\) \{ showPlanLock\(photoLock, lockDoc\); return; \}/);
  const est = read('src/components/estimates/EstimateAttachments.tsx');
  assert.match(est, /showPlanLock\(photoLock, 'estimate'\)/);
  assert.match(est, /estimateAttachmentPlanLock\(e,/, 'an upload refusal is the sheet, not a failed tile');
});

test('the entry cue: a lock glyph on the locked trigger', () => {
  assert.match(read('src/components/bank/BankAccountsScreen.tsx'), /\{locked && <Icon name="lock"/);
  assert.match(read('src/components/AttachmentsEditor.tsx'), /\{photoLock && <Icon name="lock"/);
  assert.match(read('src/components/estimates/EstimateAttachments.tsx'), /\{photoLock && <Icon name="lock"/);
});

test('every convert hands over the skipped photos; the estimate screen stores them too', () => {
  assert.match(read('src/components/alive/useConvert.ts'), /notePhotosSkipped\(out\.attachmentsSkipped\)/);
  const detail = read('src/components/estimates/EstimateDetail.tsx');
  assert.match(detail, /copyAttachmentsOutcome\(supabase, inv\.user_id, inv\.id, created\.id\)/);
  assert.match(detail, /attachmentsSkippedColumns\(NEXT_PUBLIC_TIERS,/);
  assert.match(detail, /notePhotosSkipped\(copy\.skipped\)/);
  assert.doesNotMatch(detail, /\bcopyAttachments\(/, 'no count-only copy left on the convert path');
});

test('the inline note reads the stored row and is never shown to Plus', () => {
  const inv = read('src/components/invoice-detail/InvoiceDetailScreen.tsx');
  assert.match(inv, /skippedFromRow\(inv,/);
  assert.match(inv, /showPhotosSkipped\(skipped, planTiers\.plan\)/);
});

test('no price, plan name or limit typed in the sheet or the notice', () => {
  for (const f of ['src/components/tiers/LockSheet.tsx', 'src/components/tiers/PhotosSkipped.tsx', 'src/components/tiers/TiersHost.tsx']) {
    assert.doesNotMatch(read(f), /\$\d|['"](Pro|Plus|Free)['"]|\b14 days\b/, f);
  }
});
