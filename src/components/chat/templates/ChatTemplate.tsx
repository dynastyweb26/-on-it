'use client';
// Draws one resolved template card in the thread. The decision to draw (id wired,
// props valid) is render-model.ts; callbacks are the host's.
import RankedList from './RankedList';
import StatTiles from './StatTiles';
import NavLink from './NavLink';
import CantDo from './CantDo';
import ConfirmBatch from './ConfirmBatch';
import type { ResolvedTemplate } from './render-model';
import type { CantDoCallbacks, ConfirmBatchCallbacks, NavLinkCallbacks, RankedListCallbacks } from '@/lib/templates/callbacks';

export type ChatTemplateHandlers = RankedListCallbacks & NavLinkCallbacks & CantDoCallbacks & ConfirmBatchCallbacks & {
  /** cant.do: false hides Request this feature (the reply has no messageId to attach it to). */
  requestable?: boolean;
  /** confirm.batch: live while its token is in memory; done or expired when the chat was reopened. */
  confirmView?: 'live' | 'done' | 'expired';
};

export default function ChatTemplate({ card, handlers }: { card: ResolvedTemplate; handlers: ChatTemplateHandlers }) {
  switch (card.id) {
    case 'list.ranked':
      return <RankedList {...card.props} onRowTap={handlers.onRowTap} onShowAll={handlers.onShowAll} onRetry={handlers.onRetry} />;
    case 'stat.tiles':
      return <StatTiles {...card.props} onRetry={handlers.onRetry} />;
    case 'nav.link':
      return <NavLink {...card.props} onOpen={handlers.onOpen} onRetry={handlers.onRetry} />;
    case 'confirm.batch':
      return <ConfirmBatch {...card.props} state={handlers.confirmView === 'done' ? 'done' : card.props.state} expired={handlers.confirmView === 'expired'} onPrimary={handlers.onPrimary} onRemove={handlers.onRemove} onUndo={handlers.onUndo} />;
    case 'cant.do':
      return <CantDo {...card.props} onAlt={handlers.onAlt} onRequest={handlers.onRequest} requestable={handlers.requestable} />;
  }
}
