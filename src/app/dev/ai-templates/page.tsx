// Design fixtures for the AI chat templates (RULES.md §7). One template in one
// state per URL, from the board's sample data, inside the chat column with the
// assistant avatar. The design-diff gate drives this page. It does not exist in
// production: Vercel sets VERCEL_ENV=production there, and the page 404s.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ComponentType } from 'react';
import { AssistantAvatar } from '@/components/chat/EventCard';
import RankedList from '@/components/chat/templates/RankedList';
import StatTiles from '@/components/chat/templates/StatTiles';
import NavLink from '@/components/chat/templates/NavLink';
import CantDo from '@/components/chat/templates/CantDo';
import TrendChart from '@/components/chat/templates/TrendChart';
import Breakdown from '@/components/chat/templates/Breakdown';
import ConfirmBatch from '@/components/chat/templates/ConfirmBatch';
import { TEMPLATE_IDS, isTemplateId, type TemplateId } from '@/lib/tools/templates';
import { TEMPLATE_STATES } from '@/lib/templates/props';
import { TEMPLATE_FIXTURES } from '@/lib/templates/fixtures';

export const dynamic = 'force-dynamic';

// Built templates only; an id that is not here is listed as NOT BUILT, never
// drawn as a stand-in (RULES.md §1).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BUILT: Partial<Record<TemplateId, ComponentType<any>>> = {
  'list.ranked': RankedList,
  'stat.tiles': StatTiles,
  'nav.link': NavLink,
  'cant.do': CantDo,
  'chart.trend': TrendChart,
  'chart.breakdown': Breakdown,
  'confirm.batch': ConfirmBatch,
};

// Sample text a design file carries that is not in the typed props yet (the design's emptyTitle default).
const EXTRAS = (t: TemplateId, s: string): object => (t === 'nav.link' ? { emptyTitle: 'INV-0069 is gone' } : t === 'confirm.batch' && s === 'partial' ? { failIndex: 1 } : {});

export default function Page({ searchParams }: { searchParams: { template?: string; state?: string } }) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const { template, state } = searchParams;
  if (!template) return <Index />;
  if (!isTemplateId(template)) notFound();
  const states: readonly string[] = TEMPLATE_STATES[template];
  const Card = BUILT[template];
  if (!Card || !state || !states.includes(state)) notFound();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col xl:max-w-[720px]">
      {/* The chat list's padding, except at xl where the board's thread has none (720 column, 28 avatar, 8 gap). */}
      <div className="px-4 py-4 md:px-6 xl:px-0">
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AssistantAvatar />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Card {...TEMPLATE_FIXTURES[template]} {...EXTRAS(template, state)} state={state} />
          </div>
        </div>
      </div>
    </main>
  );
}

function Index() {
  return (
    <main style={{ padding: 24, fontFamily: 'var(--font-inter), sans-serif' }}>
      <h1 style={{ fontWeight: 700, marginBottom: 12 }}>AI chat templates · fixtures</h1>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0 }}>
        {TEMPLATE_IDS.map((id) => (
          <li key={id}>
            <strong>{id}</strong>
            {BUILT[id] ? '' : ' (not built)'}
            {': '}
            {TEMPLATE_STATES[id].map((s) =>
              BUILT[id] ? (
                <Link key={s} href={`/dev/ai-templates?template=${id}&state=${s}`} style={{ marginRight: 10, textDecoration: 'underline' }}>
                  {s}
                </Link>
              ) : (
                <span key={s} style={{ marginRight: 10 }}>{s}</span>
              ),
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
