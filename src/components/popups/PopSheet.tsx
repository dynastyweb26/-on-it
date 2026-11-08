'use client';
// PopSheet — the one shape for money and destructive decisions on phones
// (design/popups/boards/PopSheet.dc.html).
//
// Structure: grip, icon tile, eyebrow/title/sub, × (= the safe answer), figure
// card, what-changes rows, consequence, typed confirm, error slot, actions.
//
// Two rules are structural, not cosmetic:
//   1. Scrim, ×, Escape and swipe all map to the safe action, and do nothing
//      while a request is in flight.
//   2. A second tap is ignored by a ref set before the request starts — state
//      alone would let two taps in one frame both submit.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { useSheetDrag } from '@/lib/use-sheet-drag';
import { usePopupPending } from '@/lib/popups/use-popup-pending';
import {
  canDismiss, matchesTypedWord, resolveSheetActions, safeActionLabel, sheetRole,
  type SheetActionKind, type SheetActionSpec,
} from '@/lib/popups/sheet';

export type PopSheetAction = SheetActionSpec & {
  /** Non-go, non-safe actions (e.g. "Start a new invoice"). */
  onSelect?: () => void;
};

export interface PopSheetProps {
  open: boolean;
  icon?: IconName;
  iconTone?: 'gold' | 'danger' | 'neutral';
  destructive?: boolean;
  /** Pickers are 560px on a laptop; every other sheet is a 440px dialog. */
  width?: 'confirm' | 'picker';
  eyebrow?: string;
  title: string;
  sub?: string;
  /** The money this decision moves: label, meta line, amount. */
  figure?: { label: string; meta?: string; amount: string };
  rows?: { k: string; from?: string; to: string }[];
  /** Two-sided status lines (done / not done), e.g. "shared, but still a draft". */
  truths?: { ok: boolean; title: string; body: string }[];
  body?: string;
  /** Word the user types to unlock the go action, e.g. "DELETE". */
  typed?: string;
  /** Static failure slot, when the caller already knows the cause. */
  error?: { title?: string; body: string; icon?: IconName };
  retryLabel?: string;
  note?: string;
  actions: PopSheetAction[];
  /** Scrim, ×, Escape, swipe. Map it to the safe action. */
  onDismiss: () => void;
  /** The go action. A rejection fills the error slot, naming the real cause. */
  onConfirm?: (typedValue: string) => Promise<void> | void;
  /** What did NOT happen, prepended to a failure sentence. */
  consequence?: string;
  /** Runs after a successful confirm; defaults to onDismiss. */
  onSuccess?: () => void;
}

const TONE: Record<'gold' | 'danger' | 'neutral', { bg: string; fg: string }> = {
  gold: { bg: 'bg-primary-soft', fg: 'text-on-background' },
  danger: { bg: 'bg-surface-container-low', fg: 'text-error' },
  neutral: { bg: 'bg-surface-container-high', fg: 'text-on-background' },
};

// The board's five button kinds. Heights and fills are literal here because
// each kind has its own: gold 56, danger/outline 52, text 44.
function actionClass(kind: SheetActionKind, muted: boolean): string {
  const dim = 'bg-surface-container-high text-on-surface-variant';
  if (kind === 'gold') return `h-14 rounded-[28px] ${muted ? dim : 'bg-primary-container text-on-background'}`;
  if (kind === 'danger') {
    return muted
      ? `h-[52px] rounded-[28px] border-[1.5px] border-transparent ${dim}`
      : 'h-[52px] rounded-[28px] border-[1.5px] border-outline-variant bg-surface-container-lowest text-error';
  }
  if (kind === 'dark') return `h-14 rounded-[28px] ${muted ? dim : 'bg-inverse-surface text-inverse-on-surface'}`;
  if (kind === 'text') return 'h-11 rounded-[22px] bg-transparent text-on-surface-variant';
  return muted
    ? `h-[52px] rounded-[28px] border-[1.5px] border-transparent ${dim}`
    : 'h-[52px] rounded-[28px] border-[1.5px] border-outline-variant bg-surface-container-lowest text-on-background';
}

const DISPLAY_KINDS: SheetActionKind[] = ['gold', 'danger', 'dark'];

export default function PopSheet(props: PopSheetProps) {
  if (!props.open) return null;
  return <SheetBody {...props} />;
}

function SheetBody({
  icon, iconTone = 'gold', destructive, width = 'confirm', eyebrow, title, sub, figure, rows, truths, body,
  typed, error, retryLabel, note, actions, onDismiss, onConfirm, consequence, onSuccess,
}: Omit<PopSheetProps, 'open'>) {
  const titleId = useId();
  const [typedValue, setTypedValue] = useState('');
  const { pending, pendingRef, failure, run } = usePopupPending();

  const dismiss = () => {
    if (!canDismiss(pendingRef.current)) return;
    onDismiss();
  };
  // Escape is bound once; the ref keeps it pointed at this render's dismiss.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(dismiss);

  const typedOk = matchesTypedWord(typedValue, typed);
  const views = resolveSheetActions(actions, { pending, error: failure !== null, typedOk, retryLabel });
  const shownError = failure ?? error;
  const safeLabel = safeActionLabel(actions);
  const tone = TONE[iconTone];

  async function confirm() {
    if (!onConfirm) return;
    const ok = await run(async () => { await onConfirm(typedValue); }, consequence);
    if (ok) (onSuccess ?? onDismiss)();
  }

  function press(action: PopSheetAction, index: number) {
    // The synchronous guard comes first: `views[index].disabled` is from the
    // render before a same-frame second tap.
    if (pendingRef.current) return;
    if (views[index]?.disabled) return;
    if (action.go) { void confirm(); return; }
    if (action.safe) { dismiss(); return; }
    if (action.runs && action.onSelect) {
      // Called synchronously from the tap: run() starts the task before its first
      // await, so a share sheet opened here keeps the tap's user activation (iOS).
      const task = action.onSelect;
      void run(async () => { await task(); }, consequence);
      return;
    }
    action.onSelect?.();
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto xl:items-center xl:p-6" data-pop-sheet="" data-no-tab-swipe="true" data-kb-fit="">
      <div className="onit-composer-scrim absolute inset-0 bg-on-background/40" style={scrimStyle} onClick={dismiss} aria-hidden />
      <div
        role={sheetRole(destructive)}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={pending}
        style={sheetStyle}
        className={`onit-sheet-in relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-background px-[18px] pb-[max(26px,env(safe-area-inset-bottom))] pt-2.5 shadow-card-raised xl:max-w-none xl:rounded-[24px] xl:px-6 xl:pb-6 xl:pt-[22px] xl:shadow-[0_30px_60px_-20px_rgba(30,24,14,.45)] ${
          width === 'picker' ? 'xl:w-[560px]' : 'xl:w-[440px]'
        }`}
      >
        <div data-sheet-handle="" className="cursor-grab select-none pb-2 xl:hidden" {...handleProps}>
          <span
            aria-hidden
            className={`mx-auto mt-2 block h-[5px] w-[38px] rounded-full bg-outline-variant ${pending ? 'opacity-40' : ''}`}
          />
        </div>

        <div className="flex items-start gap-3">
          {icon && (
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] ${tone.bg}`}>
              <Icon name={icon} size={22} className={tone.fg} />
            </div>
          )}
          <div className="min-w-0 flex-1 pt-px">
            {eyebrow && (
              <div className="font-display text-[11px] font-bold uppercase tracking-[1.5px] text-primary">{eyebrow}</div>
            )}
            <h2 id={titleId} className="text-balance font-display text-[21px] font-extrabold leading-[1.2] text-on-background">
              {title}
            </h2>
            {sub && <p className="mt-0.5 text-[14px] leading-[1.45] text-on-surface-variant">{sub}</p>}
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            aria-label={safeLabel}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-container text-on-background transition active:scale-95 disabled:opacity-35 disabled:active:scale-100"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {figure && (
          <div className="mt-3.5 flex items-center gap-3 rounded-[18px] border border-outline-variant/40 bg-surface-container-lowest px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-semibold text-on-background">{figure.label}</div>
              {figure.meta && <div className="truncate text-[13px] text-on-surface-variant">{figure.meta}</div>}
            </div>
            <div className="shrink-0 font-display text-[20px] font-extrabold tabular-nums text-on-background">
              {figure.amount}
            </div>
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="mt-3.5 divide-y divide-outline-variant/30 overflow-hidden rounded-[18px] border border-outline-variant/40 bg-surface-container-lowest">
            {rows.map((row) => (
              <div key={row.k} className="flex items-baseline gap-3 px-4 py-[11px]">
                <span className="w-[92px] shrink-0 text-[13px] text-on-surface-variant">{row.k}</span>
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

        {truths && truths.length > 0 && (
          <div className="mt-3.5 flex flex-col gap-2.5">
            {truths.map((t) => (
              <div key={t.title} className="flex items-start gap-3 rounded-[16px] border border-outline-variant/40 bg-surface-container-lowest px-3.5 py-3">
                <Icon name={t.ok ? 'check' : 'sync_problem'} size={20} className={`mt-px shrink-0 ${t.ok ? 'text-primary' : 'text-error'}`} />
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-on-background">{t.title}</div>
                  <div className="text-[14px] leading-[1.45] text-on-surface-variant">{t.body}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {body && <p className="mt-3.5 text-[15px] leading-[1.45] text-on-background/90">{body}</p>}

        {typed && (
          <label className="mt-3.5 flex flex-col gap-1.5">
            <span className="font-display text-[11px] font-bold uppercase tracking-[1.5px] text-on-surface-variant">
              Type {typed} to confirm
            </span>
            <input
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              disabled={pending}
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className={`h-[52px] rounded-[16px] border-[1.5px] bg-surface-container-lowest px-4 font-display text-[17px] font-bold uppercase tracking-[2px] text-on-background outline-none transition focus:border-primary-container ${
                typedOk ? 'border-primary-container' : 'border-outline-variant'
              }`}
            />
          </label>
        )}

        {shownError && (
          <div role="alert" className="mt-3.5 flex items-start gap-3 rounded-[16px] border border-primary-container/20 bg-surface-container-low px-3.5 py-3">
            <Icon name={shownError.icon ?? 'error'} size={20} className="mt-px shrink-0 text-error" />
            <div className="min-w-0">
              {shownError.title && (
                <div className="text-[15px] font-semibold text-on-background">{shownError.title}</div>
              )}
              <div className="text-[14px] leading-[1.45] text-on-surface-variant">{shownError.body}</div>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2.5">
          {actions.map((action, index) => {
            const view = views[index];
            const displayKind = DISPLAY_KINDS.includes(view.kind);
            return (
              <button
                key={`${action.label}-${index}`}
                type="button"
                onClick={() => press(action, index)}
                disabled={view.disabled}
                aria-busy={view.busy || undefined}
                className={`flex w-full items-center justify-center gap-2 px-4 transition active:scale-[0.97] disabled:active:scale-100 ${
                  displayKind ? 'font-display text-[16px] font-bold' : 'font-body text-[15px] font-semibold'
                } ${actionClass(view.kind, view.muted)}`}
              >
                {view.busy && (
                  <span className="h-4 w-4 rounded-full border-2 border-on-surface-variant border-t-transparent motion-safe:animate-spin" />
                )}
                {view.label}
              </button>
            );
          })}
        </div>

        {note && <p className="mt-3 text-center text-[13px] leading-[1.45] text-on-surface-variant">{note}</p>}

        {pending && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-on-surface-variant">
            <Icon name="lock" size={15} />
            Can&apos;t be closed until this finishes
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
