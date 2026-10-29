'use client';
// One shared empty state: a short message, exactly one primary action, and an
// optional illustration slot. Mirrors InvoicesEmpty (NAV-SPEC Phase 1) so every
// list screen speaks with the same voice and keeps its action on screen.
import type { ReactNode } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';

export default function EmptyState({
  icon = 'receipt_long',
  illustration,
  title,
  message,
  action,
  onAction,
  actionIcon = 'add',
  variant = 'primary',
  coach,
}: {
  icon?: IconName;
  /** Optional illustration slot; replaces the icon circle when provided. */
  illustration?: ReactNode;
  title?: string;
  message: string;
  action: string;
  onAction: () => void;
  actionIcon?: IconName;
  variant?: 'primary' | 'outline';
  coach?: string;
}) {
  return (
    <div data-coach={coach} className="onit-rise mx-auto mt-16 max-w-sm px-4 text-center">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary-soft text-on-background">
        {illustration ?? <Icon name={icon} size={36} />}
      </span>
      {title && <h1 className="mt-5 font-display text-xl font-bold text-on-background">{title}</h1>}
      <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">{message}</p>
      <button
        type="button"
        className={`${variant === 'outline' ? 'btn-outline' : 'btn-primary'} mx-auto mt-6 px-7`}
        onClick={onAction}
      >
        <Icon name={actionIcon} size={22} /> {action}
      </button>
    </div>
  );
}
