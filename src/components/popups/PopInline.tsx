'use client';
// PopInline — the transcript shape (design/popups/boards/PopInline.dc.html).
// For prompts the conversation asked: a change guard, which client, sign in,
// failures, AI replies. It scrolls with the thread and stays until answered,
// so it has no scrim, no × and no dismissal.
//
// Money-free but not consequence-free: while an action runs, every control is
// locked and a second tap is dropped by a ref set before the request.
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { usePopupPending } from '@/lib/popups/use-popup-pending';

export type PopInlineActionKind = 'gold' | 'outline' | 'danger' | 'text';

export interface PopInlineAction {
  label: string;
  kind?: PopInlineActionKind;
  busyLabel?: string;
  disabled?: boolean;
  onSelect: () => Promise<void> | void;
}

export interface PopInlineChoice {
  label: string;
  sub?: string;
  icon?: IconName;
  onSelect: () => Promise<void> | void;
}

export interface PopInlineProps {
  /** The message above the card, when the prompt answers something typed. */
  user?: string;
  eyebrow?: string;
  eyebrowIcon?: IconName;
  title?: string;
  text: string;
  /** What would change, old value struck through. */
  rows?: { k: string; from?: string; to: string }[];
  choices?: PopInlineChoice[];
  actions?: PopInlineAction[];
  caption?: string;
  /** A failure the user must read, rather than a prompt. */
  tone?: 'prompt' | 'error';
  /** Static failure slot, when the caller already knows the cause. */
  error?: { title?: string; body: string };
  /** What did NOT happen, prepended to a failure sentence. */
  consequence?: string;
  /** Runs after an action succeeds, if the caller wants to retire the card. */
  onSuccess?: () => void;
}

function actionClass(kind: PopInlineActionKind, muted: boolean): string {
  const dim = 'bg-surface-container-high text-on-surface-variant';
  if (kind === 'gold') {
    return `h-12 rounded-[24px] ${muted ? dim : 'bg-primary-container text-on-background'}`;
  }
  if (kind === 'danger') {
    return muted
      ? `h-12 rounded-[24px] border-[1.5px] border-transparent ${dim}`
      : 'h-12 rounded-[24px] border-[1.5px] border-outline-variant bg-surface-container-lowest text-error';
  }
  if (kind === 'text') return 'h-11 rounded-[22px] bg-transparent text-on-surface-variant';
  return muted
    ? `h-12 rounded-[24px] border-[1.5px] border-transparent ${dim}`
    : 'h-12 rounded-[24px] border-[1.5px] border-outline-variant bg-surface-container-lowest text-on-background';
}

export default function PopInline({
  user, eyebrow, eyebrowIcon = 'edit', title, text, rows, choices, actions, caption,
  tone = 'prompt', error, consequence, onSuccess,
}: PopInlineProps) {
  const { pending, pendingRef, failure, run } = usePopupPending();
  const shownError = failure ?? error;
  // `failure ?? error` is undefined (not null) when neither is set, so this
  // must be a loose check or every card announces itself as an alert.
  const isError = tone === 'error' || shownError != null;

  function select(task: () => Promise<void> | void) {
    if (pendingRef.current) return;
    void run(async () => {
      await task();
      onSuccess?.();
    }, consequence);
  }

  return (
    <div className="flex w-full flex-col items-start gap-2.5">
      {user && (
        <div className="max-w-[78%] self-end rounded-[20px] bg-inverse-surface px-4 py-3 text-[15px] leading-[1.4] text-inverse-on-surface">
          {user}
        </div>
      )}

      <div
        role={isError ? 'alert' : 'group'}
        aria-busy={pending}
        className="flex w-full max-w-[640px] flex-col gap-3 rounded-[24px] border border-primary-container/20 bg-surface-container-low p-[18px]"
      >
        {eyebrow && (
          <div className="flex items-center gap-2">
            <Icon name={eyebrowIcon} size={20} className="text-primary" />
            <span className="font-display text-[12px] font-bold uppercase tracking-[1.5px] text-primary">{eyebrow}</span>
          </div>
        )}

        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {title && <div className="text-[16px] font-semibold leading-[1.25] text-on-background">{title}</div>}
            <div className="text-[15px] leading-[1.45] text-on-background/90">{text}</div>
          </div>
        </div>

        {rows && rows.length > 0 && (
          <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-[16px] border border-outline-variant/40 bg-surface-container-lowest">
            {rows.map((row) => (
              <div key={row.k} className="flex items-baseline gap-3 px-3.5 py-[11px]">
                <span className="w-[68px] shrink-0 text-[13px] text-on-surface-variant">{row.k}</span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                  {row.from && (
                    <>
                      <span className="text-[14px] text-on-surface-variant/70 line-through">{row.from}</span>
                      <Icon name="arrow_forward" size={15} className="text-on-surface-variant/70" />
                    </>
                  )}
                  <span className="text-[15px] font-semibold text-on-background">{row.to}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {choices && choices.length > 0 && (
          <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-[16px] border border-outline-variant/40 bg-surface-container-lowest">
            {choices.map((choice) => (
              <button
                key={choice.label}
                type="button"
                onClick={() => select(choice.onSelect)}
                disabled={pending}
                className="flex min-h-[58px] w-full items-center gap-3 px-3.5 py-2.5 text-left transition active:bg-surface-container-low disabled:active:bg-transparent"
              >
                {choice.icon && <Icon name={choice.icon} size={20} className="shrink-0 text-on-surface-variant" />}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] font-semibold text-on-background">{choice.label}</span>
                  {choice.sub && <span className="text-[13px] text-on-surface-variant">{choice.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {shownError && (
          <div className="flex items-start gap-2.5 rounded-[16px] border border-primary-container/20 bg-surface-container-lowest px-3.5 py-3">
            <Icon name={shownError.title ? 'warning' : 'error'} size={20} className="mt-px shrink-0 text-error" />
            <div className="min-w-0">
              {shownError.title && (
                <div className="text-[15px] font-semibold text-on-background">{shownError.title}</div>
              )}
              <div className="text-[14px] leading-[1.45] text-on-background/90">{shownError.body}</div>
            </div>
          </div>
        )}

        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map((action, index) => {
              const kind = action.kind ?? 'outline';
              const muted = pending || action.disabled === true;
              const displayKind = kind === 'gold' || kind === 'danger';
              return (
                <button
                  key={`${action.label}-${index}`}
                  type="button"
                  onClick={() => select(action.onSelect)}
                  disabled={muted}
                  aria-busy={(pending && index === 0) || undefined}
                  className={`flex min-w-0 items-center justify-center gap-2 px-4 transition active:scale-[0.97] disabled:active:scale-100 ${
                    displayKind ? 'font-display text-[15px] font-bold' : 'font-body text-[15px] font-semibold'
                  } ${actionClass(kind, muted)}`}
                >
                  {pending && index === 0 && (
                    <span className="h-4 w-4 rounded-full border-2 border-on-surface-variant border-t-transparent motion-safe:animate-spin" />
                  )}
                  {pending && index === 0 && action.busyLabel ? action.busyLabel : action.label}
                </button>
              );
            })}
          </div>
        )}

        {caption && <div className="text-center text-[13px] leading-[1.45] text-on-surface-variant">{caption}</div>}
      </div>
    </div>
  );
}
