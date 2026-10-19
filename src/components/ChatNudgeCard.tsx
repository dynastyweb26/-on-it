'use client';
// A soft, compact card used for in-chat nudges (payouts tip, feedback ask).
// One source for the card shell (border, radius, padding, background), the
// eyebrow/title/body type scale, and the button row, so the tips and the
// feedback prompt can't drift apart. Callers own the actions and their
// behavior; this component only draws them.
import type { ReactNode } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';

export type ChatNudgeAction = {
  label: string;
  onClick: () => void;
  /** "primary" is the dark-gold pill (e.g. Set up Payouts); the other is outlined. */
  variant: 'primary' | 'secondary';
};

const ACTION_CLASS: Record<ChatNudgeAction['variant'], string> = {
  primary: 'rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-on-primary transition active:scale-95',
  secondary: 'rounded-full border border-outline-variant px-4 py-2 text-[13px] font-semibold text-on-surface-variant transition active:scale-95',
};

export default function ChatNudgeCard({
  icon,
  eyebrow,
  title,
  body,
  actions,
  className = '',
}: {
  icon: IconName;
  eyebrow: string;
  title: string;
  body: ReactNode;
  actions: ChatNudgeAction[];
  /** Layout only (e.g. the message-list width). Never restyle the shell here. */
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-primary/30 bg-surface-container px-4 py-3.5 ${className}`}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon name={icon} size={15} className="text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-primary">{eyebrow}</span>
      </div>
      <p className="mb-1 text-[15px] font-bold leading-snug text-on-surface">{title}</p>
      <p className="mb-3 text-[13px] leading-snug text-on-surface-variant">{body}</p>
      <div className="flex gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={ACTION_CLASS[action.variant]}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
