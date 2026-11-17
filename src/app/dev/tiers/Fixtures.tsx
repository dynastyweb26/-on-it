// Client half of /dev/tiers: the cards take tap handlers.
'use client';
import AiMeter from '@/components/chat/AiMeter';
import AiLimitCard from '@/components/chat/AiLimitCard';
import { upgradeFor } from '@/lib/ai-meter-view';
import { PLAN_CATALOG } from '@/lib/plan-catalog';


const LATER = '2099-01-01T06:00:00.000Z';
const limitOf = (plan: 'free' | 'pro' | 'plus') => PLAN_CATALOG.plans.find((p) => p.plan === plan)!.limits.aiDailyLimit;

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
        <Label>3B pro (row ships with section 01)</Label>
        <div data-fixture="card-plus"><AiLimitCard limit={plus} upgrade={upgradeFor('plus', PLAN_CATALOG)} /></div>
        <Label>3B plus · no upgrade row</Label>
        <div data-fixture="card-pending"><AiLimitCard limit={free} upgrade={upgradeFor('free', PLAN_CATALOG)} onUpgrade={noop} pending /></div>
        <Label>pending · paywall opening</Label>
        <div data-fixture="card-collapsed"><AiLimitCard limit={free} collapsed upgrade={null} /></div>
        <Label>repeat send · collapsed</Label>
      </div>
    </main>
  );
}
