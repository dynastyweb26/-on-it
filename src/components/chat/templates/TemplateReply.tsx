'use client';
// One assistant reply that carries a template card: the avatar, the short bubble,
// then the card. Spacing is RULES.md §4: 16 from the user's message (24 from
// anything else), 24 to the next turn (12 of the list's space-y + 12 padding), a
// 28px avatar and 8px gutter, 8 from the bubble to the card. Used by the chat
// thread and by the fixtures page, so the two cannot drift.
//
// Motion (RULES.md §3, owner-approved Nov 13 2026): a live reply types its text, and
// only when that has finished does the card enter with the alive layer's fadeUp
// (.al-fade-up: translateY 6px to 0, opacity 0 to 1, .3s ease-out), then the list
// scrolls the smallest amount that shows it. Reduced motion (the stylesheet) and a
// restored reply (live=false) show the card at once with no motion.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AssistantAvatar } from '@/components/chat/EventCard';
import StreamText from '@/components/chat/StreamText';
import ChatTemplate, { type ChatTemplateHandlers } from './ChatTemplate';
import { smallestScroll } from './scroll-into-view';
import type { ResolvedTemplate } from './render-model';

export default function TemplateReply({
  content, card, handlers, prevRole, after, live = false, onTextDone,
}: {
  content: string;
  card: ResolvedTemplate;
  handlers: ChatTemplateHandlers;
  prevRole?: 'user' | 'assistant';
  after?: ReactNode;
  /** A reply that just arrived (not restored): its text types out and the card enters. */
  live?: boolean;
  /** The reply text has finished appearing (thumbs wait for it). */
  onTextDone?: () => void;
}) {
  const [textDone, setTextDone] = useState(!live || !content);
  const cardRef = useRef<HTMLDivElement>(null);
  const done = () => {
    setTextDone(true);
    onTextDone?.();
  };

  // A reply with no text has nothing to wait for.
  useEffect(() => {
    if (!content) onTextDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the text above has finished and the card has landed, bring it into the list's own viewport.
  useEffect(() => {
    if (!live || !textDone) return;
    const id = requestAnimationFrame(() => {
      const el = cardRef.current;
      const list = el?.closest<HTMLElement>('[data-coach="chat-messages"]');
      if (!el || !list) return;
      const by = smallestScroll(list.getBoundingClientRect(), el.getBoundingClientRect());
      if (by) list.scrollTop += by;
    });
    return () => cancelAnimationFrame(id);
  }, [live, textDone]);

  return (
    <div data-template-reply className={`flex justify-start gap-2 pb-3 xl:pb-2.5 ${prevRole === 'user' ? '!mt-4' : '!mt-6'}`}>
      <AssistantAvatar />
      <div className="flex min-w-0 flex-1 flex-col items-stretch gap-2">
        {content && (
          <div className="max-w-[82%] self-start whitespace-pre-wrap rounded-[18px] rounded-bl-md border border-outline-variant/50 bg-surface-container px-3.5 py-2.5 text-[15px] leading-snug">
            {live ? <StreamText text={content} onDone={done} /> : content}
          </div>
        )}
        {textDone && (
          <div ref={cardRef} className={live ? 'al-fade-up' : undefined}>
            <ChatTemplate card={card} handlers={handlers} />
          </div>
        )}
        {/* The thumbs sit 4 under the card (8 of gap, pulled up 4). */}
        {textDone && after && <div style={{ marginTop: -4 }}>{after}</div>}
      </div>
    </div>
  );
}
