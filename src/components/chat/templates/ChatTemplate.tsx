'use client';
// Draws one resolved template card in the thread. The decision to draw (id wired,
// props valid) is render-model.ts; callbacks are the host's.
import RankedList from './RankedList';
import StatTiles from './StatTiles';
import NavLink from './NavLink';
import CantDo from './CantDo';
import type { ResolvedTemplate } from './render-model';
import type { CantDoCallbacks, NavLinkCallbacks, RankedListCallbacks } from '@/lib/templates/callbacks';

export type ChatTemplateHandlers = RankedListCallbacks & NavLinkCallbacks & CantDoCallbacks;

export default function ChatTemplate({ card, handlers }: { card: ResolvedTemplate; handlers: ChatTemplateHandlers }) {
  switch (card.id) {
    case 'list.ranked':
      return <RankedList {...card.props} onRowTap={handlers.onRowTap} onShowAll={handlers.onShowAll} onRetry={handlers.onRetry} />;
    case 'stat.tiles':
      return <StatTiles {...card.props} onRetry={handlers.onRetry} />;
    case 'nav.link':
      return <NavLink {...card.props} onOpen={handlers.onOpen} onRetry={handlers.onRetry} />;
    case 'cant.do':
      return <CantDo {...card.props} onAlt={handlers.onAlt} onRequest={handlers.onRequest} />;
  }
}
