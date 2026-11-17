// Client half of /dev/tiers: the cards take tap handlers.
'use client';
import AiMeter from '@/components/chat/AiMeter';
import AiLimitCard from '@/components/chat/AiLimitCard';
import { upgradeFor } from '@/lib/ai-meter-view';
import { PLAN_CATALOG } from '@/lib/plan-catalog';
import LockSheet from '@/components/tiers/LockSheet';
import { PhotosSkippedNote, PhotosSkippedToast } from '@/components/tiers/PhotosSkipped';
import { planLock } from '@/lib/plan-lock';
import { includedChip, lockActions, lockSheetCopy, type LockDoc } from '@/lib/plan-lock-view';
import type { PlanFeature } from '@/lib/plan-lock';
import { PlanScreenView } from '@/components/tiers/PlanScreen';
import { planCardFor, type PlanCardInput } from '@/lib/plan-card';
import { planAction, planCardView, manageLabel, usageRows, type UsageInput } from '@/lib/plan-screen-view';


const LATER = '2099-01-01T06:00:00.000Z';
const limitOf = (plan: 'free' | 'pro' | 'plus') => PLAN_CATALOG.plans.find((p) => p.plan === plan)!.limits.aiDailyLimit;

const plusName = PLAN_CATALOG.plans.find((p) => p.plan === 'plus')!.name;
const SKIPPED = { count: 6, sourceDocNumber: 'E-0051' };
type LockRow = [string, PlanFeature, LockDoc, string, string | null, 'idle' | 'pending' | 'error', string];
const LOCKS: LockRow[] = [
  ['lock-bank-free', 'bank', 'invoice', 'free', null, 'idle', '4A free · connect a bank'],
  ['lock-recurring-free', 'recurring', 'invoice', 'free', null, 'idle', '4B recurring'],
  ['lock-photos-estimate', 'attachments', 'estimate', 'free', null, 'idle', '4B photos · opened from an estimate'],
  ['lock-pro-idle', 'bank', 'invoice', 'active', 'pro', 'idle', '4C pro · idle'],
  ['lock-pro-pending', 'bank', 'invoice', 'active', 'pro', 'pending', '4C pending · not now and drag off'],
  ['lock-pro-error', 'bank', 'invoice', 'active', 'pro', 'error', '4C error · names the cause'],
];

function Sheet({ feature, doc, tier, plan, state }: { feature: PlanFeature; doc: LockDoc; tier: string; plan: string | null; state: 'idle' | 'pending' | 'error' }) {
  const lock = planLock(feature, tier, plan)!;
  return (
    <LockSheet
      inline
      copy={lockSheetCopy(feature, doc)}
      chip={includedChip(lock, PLAN_CATALOG)}
      actions={lockActions(lock, PLAN_CATALOG, true)!}
      isPro={lock.plan !== 'free'}
      state={state}
      error={{ icon: 'wifi_off', text: 'Couldn’t reach the App Store. Check your signal and try again. Nothing was charged.' }}
      onPrimary={() => {}}
      onDismiss={() => {}}
    />
  );
}

const RENEW = '2026-12-15T12:00:00Z';
const FREE_USAGE: UsageInput = { aiUsedToday: 3, aiLimit: 5, invoiceCount: 2, invoiceLimit: 3, estimateCount: 3, estimateLimit: 3, expenseCount: 4, expenseLimit: 5 };
type PlanRow = [string, PlanCardInput, UsageInput, 'idle' | 'busy' | 'error', string];
const PLANS: PlanRow[] = [
  ['plan-free', { tier: 'free', plan: 'free' }, FREE_USAGE, 'idle', '6A free'],
  ['plan-pro', { tier: 'active', plan: 'pro', currentPeriodEnd: RENEW, billingSource: 'app_store' }, { aiUsedToday: 12, aiLimit: 30 }, 'idle', '6B pro'],
  ['plan-trial', { tier: 'trialing', plan: 'plus', trialEndsAt: '2026-11-29T12:00:00Z' }, { aiUsedToday: 4, aiLimit: 100 }, 'idle', '6C trial'],
  ['plan-plus', { tier: 'active', plan: 'plus', currentPeriodEnd: RENEW, billingSource: 'app_store' }, { aiUsedToday: 40, aiLimit: 100 }, 'idle', '6C plus'],
  ['plan-pending', { tier: 'active', plan: 'plus', currentPeriodEnd: RENEW, planChangeTo: 'pro', planChangeAt: RENEW, billingSource: 'app_store' }, { aiUsedToday: 40, aiLimit: 100 }, 'idle', '6C pending downgrade · keep plus undoes it'],
  ['plan-founder', { tier: 'founder', plan: 'plus' }, { aiUsedToday: 9, aiLimit: 100 }, 'idle', '6C founder · no actions, no manage link'],
  ['plan-busy', { tier: 'active', plan: 'pro', currentPeriodEnd: RENEW, billingSource: 'app_store' }, { aiUsedToday: 12, aiLimit: 30 }, 'busy', 'pending · spinner in the tapped button, others disabled'],
  ['plan-action-error', { tier: 'active', plan: 'pro', currentPeriodEnd: RENEW }, { aiUsedToday: 12, aiLimit: 30 }, 'error', 'action error · names the cause'],
];

function Plan({ input, usage, state }: { input: PlanCardInput; usage: UsageInput; state: 'idle' | 'busy' | 'error' }) {
  const card = planCardFor(input);
  return (
    <PlanScreenView
      state="ready"
      card={planCardView(card, PLAN_CATALOG, true)}
      usage={usageRows(card, usage, PLAN_CATALOG)}
      action={planAction(card, PLAN_CATALOG)}
      manage={card.manage ? { label: manageLabel(card) } : null}
      restore={card.canRestore}
      busy={state === 'busy' ? 'action' : null}
      error={state === 'error' ? 'Plus is only available in the On It app. Nothing was charged.' : null}
      onAction={() => {}}
      onManage={() => {}}
      onRestore={() => {}}
    />
  );
}

function Label({ children }: { children: string }) {
  return <div style={{ font: "500 10.5px ui-monospace, Menlo, monospace", color: '#6b6257', margin: '6px 0 18px' }}>{children}</div>;
}

export default function Fixtures() {
  const free = limitOf('free'), pro = limitOf('pro'), plus = limitOf('plus');
  const noop = () => {};
  return (
    <main style={{ background: '#fff8f0', minHeight: '100vh', padding: '24px 14px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ font: '800 20px var(--font-montserrat)', margin: '0 0 16px' }}>02 AI meter</h1>
        {[1, 2, 4].map((used) => (
          <div key={used} data-fixture={`meter-${used}`}>
            <AiMeter meter={{ used, limit: free, resetsAt: LATER }} />
            <Label>{`free · ${used} used`}</Label>
          </div>
        ))}
        <div data-fixture="meter-plus">
          <AiMeter meter={{ used: plus - 3, limit: plus, resetsAt: LATER }} />
          <Label>plus · 3 left</Label>
        </div>

        <h1 style={{ font: '800 20px var(--font-montserrat)', margin: '24px 0 16px' }}>03 AI limit card</h1>
        <div data-fixture="card-free"><AiLimitCard limit={free} upgrade={upgradeFor('free', PLAN_CATALOG)} onUpgrade={noop} /></div>
        <Label>3A free · 0 left</Label>
        <div data-fixture="card-pro"><AiLimitCard limit={pro} upgrade={upgradeFor('pro', PLAN_CATALOG)} onUpgrade={noop} /></div>
        <Label>3B pro · upgrade to plus</Label>
        <div data-fixture="card-plus"><AiLimitCard limit={plus} upgrade={upgradeFor('plus', PLAN_CATALOG)} /></div>
        <Label>3B plus · no upgrade row</Label>
        <div data-fixture="card-pending"><AiLimitCard limit={free} upgrade={upgradeFor('free', PLAN_CATALOG)} onUpgrade={noop} pending /></div>
        <Label>pending · paywall opening</Label>
        <div data-fixture="card-collapsed"><AiLimitCard limit={free} collapsed upgrade={null} /></div>
        <Label>repeat send · collapsed</Label>

        <h1 style={{ font: '800 20px var(--font-montserrat)', margin: '24px 0 16px' }}>04 Lock sheets</h1>
        {LOCKS.map(([id, feature, doc, tier, plan, state, label]) => (
          <div key={id} data-fixture={id} style={{ marginBottom: 4 }}>
            <Sheet feature={feature} doc={doc} tier={tier} plan={plan} state={state} />
            <Label>{label}</Label>
          </div>
        ))}

        <h1 style={{ font: '800 20px var(--font-montserrat)', margin: '24px 0 16px' }}>05 Photos skipped</h1>
        <div data-fixture="photos-note"><PhotosSkippedNote skipped={SKIPPED} plusName={plusName} onSeePlus={noop} /></div>
        <Label>5A inline note · new invoice</Label>
        <div data-fixture="photos-note-one"><PhotosSkippedNote skipped={{ count: 1, sourceDocNumber: 'E-0007' }} plusName={plusName} onSeePlus={noop} /></div>
        <Label>inline note · one photo</Label>
        <div data-fixture="photos-toast"><PhotosSkippedToast skipped={SKIPPED} plusName={plusName} onSeePlus={noop} onDone={noop} dwellMs={null} /></div>
        <Label>5A toast · fixed at the top (kept up here)</Label>
        <h1 style={{ font: '800 20px var(--font-montserrat)', margin: '24px 0 16px' }}>06 Settings › Plan</h1>
        {PLANS.map(([id, input, usage, state, label]) => (
          <div key={id} data-fixture={id}>
            <Plan input={input} usage={usage} state={state} />
            <Label>{label}</Label>
          </div>
        ))}
        <div data-fixture="plan-loading"><PlanScreenView state="loading" /></div>
        <Label>loading · skeleton, shimmer 1.4s</Label>
        <div data-fixture="plan-load-error"><PlanScreenView state="error" onRetry={() => {}} /></div>
        <Label>load error · retry</Label>
      </div>
    </main>
  );
}
