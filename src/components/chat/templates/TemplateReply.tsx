'use client';
// One assistant reply that carries a template card: the avatar, the short bubble,
// then the card. Spacing is RULES.md §4: 16 from the user's message (24 from
// anything else), 24 to the next turn (12 of the list's space-y + 12 padding), a
// 28px avatar and 8px gutter, 8 from the bubble to the card. Used by the chat
// thread and by the fixtures page, so the two cannot drift.
import { AssistantAvatar } from '@/components/chat/EventCard';
import ChatTemplate, { type ChatTemplateHandlers } from './ChatTemplate';
import type { ResolvedTemplate } from './render-model';

export default function TemplateReply({
  content, card, handlers, prevRole,
}: { content: string; card: ResolvedTemplate; handlers: ChatTemplateHandlers; prevRole?: 'user' | 'assistant' }) {
  return (
    <div data-template-reply className={`flex justify-start gap-2 pb-3 ${prevRole === 'user' ? '!mt-4' : '!mt-6'}`}>
      <AssistantAvatar />
      <div className="flex min-w-0 flex-1 flex-col items-stretch gap-2">
        {content && (
          <div className="max-w-[82%] self-start whitespace-pre-wrap rounded-[18px] rounded-bl-md border border-outline-variant/50 bg-surface-container px-3.5 py-2.5 text-[15px] leading-snug">
            {content}
          </div>
        )}
        <ChatTemplate card={card} handlers={handlers} />
      </div>
    </div>
  );
}
