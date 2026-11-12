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
import FeedbackThumbs from '@/components/chat/templates/FeedbackThumbs';
import FeedbackCheckin from '@/components/chat/templates/FeedbackCheckin';
import DraftMessage from '@/components/chat/templates/DraftMessage';
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
  'feedback.thumbs': FeedbackThumbs,
  'feedback.checkin': FeedbackCheckin,
  'draft.message': DraftMessage,
};

// Sample state a design file seeds that the typed props do not carry (picks, a made choice, row statuses).
const EXTRAS = (t: TemplateId, s: string): object => (t === 'feedback.thumbs' && (s === 'openFilled' || s === 'error') ? { initial: { reasons: ['Wrong number'], note: 'It used last month, not this one.' } } : t === 'feedback.checkin' && s === 'picked' ? { picked: 'Love it' } : t === 'confirm.batch' && s === 'partial' ? { statuses: ['saved', 'failed', 'saved'] } : {});

export default function Page({ searchParams }: { searchParams: { template?: string; state?: string; channel?: string; device?: string } }) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const { template, state, channel, device } = searchParams;
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
            <Card {...TEMPLATE_FIXTURES[template]} {...EXTRAS(template, state)} {...(template === 'draft.message' ? { channel, device } : {})} state={state} />
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
