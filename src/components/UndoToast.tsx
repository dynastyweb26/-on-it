'use client';
// The undo toast for every undoable delete (invoice, estimate, client, item,
// expense, recurring). It is the kit's PopToast (Board 7, T2): 6 s window with
// the gold time bar, "Restoring…" while the undo runs, and, if the restore
// fails, a sentence naming the cause plus Retry that stays until it is acted on.
// Callers keep their own `onUndo`: return a promise and a failure shows here.
import PopToast from '@/components/popups/PopToast';

interface UndoToastProps {
  message: string;
  onUndo: () => Promise<void> | void;
  onDismiss?: () => void;
  /** What did NOT happen, ahead of the cause ("INV-0007 stays deleted."). */
  consequence?: string;
}

export default function UndoToast({ message, onUndo, onDismiss, consequence = 'Couldn’t restore.' }: UndoToastProps) {
  return (
    <PopToast
      icon="delete"
      text={message}
      action={{ label: 'Undo', busyLabel: 'Restoring…', onSelect: onUndo }}
      onDismiss={() => onDismiss?.()}
      consequence={consequence}
    />
  );
}
