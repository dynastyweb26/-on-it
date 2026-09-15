'use client';

import Icon from '@/components/Icon';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss?: () => void;
}

export default function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  return (
    <div className="fixed bottom-20 left-1/2 z-[90] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-card bg-inverse-surface px-4 py-3 text-inverse-on-surface shadow-card-raised transition-all">
      <span className="truncate text-body-md font-medium text-inverse-on-surface">{message}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-xs font-bold uppercase text-on-background transition active:scale-95"
        >
          <Icon name="undo" size={16} />
          Undo
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="grid h-8 w-8 place-items-center rounded-full text-inverse-on-surface/60 transition active:scale-90"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
