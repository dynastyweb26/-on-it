'use client';
// PopSheet — the kit's one decision/entry sheet.
// Board: design/popups/boards/PopSheet.dc.html (renderVals / BTN / ICON_TONE).
//
// Bottom sheet on a phone; a centered 440px dialog (pickers 560px) at >=1280.
// Scrim, ×, swipe and Escape all mean the safe answer, and none of them can
// fire while a request is running: `pending` is the rendered state, and the
// caller's TapLock (usePopAction's `guard`) is read synchronously at event
// time, before React re-renders.
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { useSheetDrag } from '@/lib/use-sheet-drag';
import { canDismiss, typedConfirmOk, type TapLock } from './action-guard';
import type { PopupError } from './error-frame';
import Spinner from './Spinner';

export type PopActionKind = 'gold' | 'danger' | 'outline' | 'dark' | 'text';
export type PopSheetAction = {
  id: string;
  label: string;
  kind?: PopActionKind;
  /** `safe` = the dismiss answer; `go` = the action that runs (and retries). */
  role?: 'safe' | 'go';
  busyLabel?: string;
  icon?: IconName;
  disabled?: boolean;
};

const ICON_TONE = {
  danger: ['bg-[#faf3e7]', 'text-[#c8412e]'],
  gold: ['bg-[#f2e5b9]', 'text-[#1e1a15]'],
  neutral: ['bg-[#efe7da]', 'text-[#1e1a15]'],
} as const;

/** BTN table from the board, plus its disabled/busy look (#efe7da). */
function actionClass(kind: PopActionKind = 'outline', state: 'idle' | 'busy' | 'off' = 'idle'): string {
  const height = kind === 'gold' || kind === 'dark' ? 'h-14' : kind === 'text' ? 'h-11' : 'h-[52px]';
  const base = `flex w-full items-center justify-center gap-2 rounded-[28px] px-[18px] font-bold transition active:scale-[.97] disabled:active:scale-100 ${height}`;
  if (state === 'busy') return `${base} bg-[#efe7da] text-[#3a352d]`;
  if (state === 'off') return `${base} bg-[#efe7da] text-[#8f8676]`;
  switch (kind) {
    case 'gold': return `${base} bg-[#d4af37] font-display text-[16px] text-[#1e1a15]`;
    case 'danger': return `${base} border-[1.5px] border-[#e3d8c5] bg-white font-display text-[16px] text-[#c8412e]`;
    case 'dark': return `${base} bg-[#34302a] font-display text-[16px] text-[#fdf8f1]`;
    case 'text': return `${base} bg-transparent font-body text-[15px] text-[#3a352d]`;
    default: return `${base} border-[1.5px] border-[#e3d8c5] bg-white font-body text-[15px] text-[#1e1a15]`;
  }
}

export default function PopSheet({
  open = true,
  title,
  eyebrow,
  sub,
  body,
  icon,
  iconTone = 'gold',
  destructive = false,
  figure,
  rows,
  truths,
  typedWord,
  note,
  pendingNote = 'Can’t be closed until this finishes',
  error = null,
  retryLabel,
  actions,
  pending = false,
  guard,
  width = 'confirm',
  onAction,
  onDismiss,
}: {
  open?: boolean;
  title: string;
  eyebrow?: string;
  sub?: string;
  body?: string;
  icon?: IconName;
  iconTone?: keyof typeof ICON_TONE;
  /** Destructive decisions are alertdialogs. */
  destructive?: boolean;
  /** The figure the decision is about — money confirms always carry it. */
  figure?: { label: string; meta?: string; amount: string };
  /** Before → after lines (change guard, convert). */
  rows?: Array<{ k: string; from?: string; to: string }>;
  /** Two facts under the question (what happens, what stays). */
  truths?: Array<{ ok?: boolean; title: string; body: string }>;
  /** When set, the go action needs this word typed exactly to enable. */
  typedWord?: string;
  note?: string;
  pendingNote?: string;
  error?: PopupError | null;
  /** The go button's label once a failure unlocked it. */
  retryLabel?: string;
  actions: PopSheetAction[];
  pending?: boolean;
  /** The caller's synchronous tap lock (usePopAction().guard). */
  guard?: TapLock;
  /** Pickers are 560px on a laptop; everything else 440px. */
  width?: 'confirm' | 'picker';
  onAction?: (id: string) => void;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const [typed, setTyped] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<() => void>(() => {});

  const dismissable = canDismiss(pending, guard);
  const close = () => {
    if (!canDismiss(pending, guard)) return;
    onDismiss();
  };
  closeRef.current = close;

  const { handleProps, sheetStyle, scrimStyle } = useSheetDrag(close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const safe = actions.find((a) => a.role === 'safe');
  const typedOk = typedConfirmOk(typed, typedWord);
  const tone = ICON_TONE[iconTone];

  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-end justify-center xl:items-center xl:p-6" data-no-tab-swipe="true">
      <div
        className="onit-composer-scrim absolute inset-0 bg-[rgba(30,24,14,.38)]"
        style={{ ...scrimStyle, cursor: dismissable ? 'pointer' : 'default' }}
        onClick={close}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role={destructive ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={pending || undefined}
        data-pop-sheet=""
        style={sheetStyle as CSSProperties}
        className={`onit-sheet-in relative flex w-full flex-col gap-3.5 rounded-t-[28px] bg-[#fdf8f1] px-[18px] pb-[max(26px,env(safe-area-inset-bottom))] pt-2.5 text-[#1e1a15] shadow-[0_-12px_30px_-18px_rgba(30,24,14,.35)] outline-none xl:rounded-[24px] xl:px-6 xl:pb-6 xl:pt-[22px] xl:shadow-[0_30px_60px_-20px_rgba(30,24,14,.45)] ${
          width === 'picker' ? 'xl:w-[560px]' : 'xl:w-[440px]'
        }`}
      >
        <div data-sheet-handle="" className="cursor-grab select-none xl:hidden" {...(dismissable ? handleProps : {})}>
          <span aria-hidden className={`mx-auto mt-0.5 block h-[5px] w-[38px] rounded-[3px] bg-[#e2d8c6] ${pending ? 'opacity-40' : ''}`} />
        </div>

        <div className="flex items-start gap-3">
          {icon && (
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] ${tone[0]}`}>
              <Icon name={icon} size={22} className={tone[1]} />
            </div>
          )}
          <div className="min-w-0 flex-1 pt-px">
            {eyebrow && (
              <div className="font-display text-[11px] font-bold uppercase tracking-[1.5px] text-[#735c00]">{eyebrow}</div>
            )}
            <div id={titleId} className="font-display text-[21px] font-extrabold leading-[1.2] [text-wrap:pretty]">{title}</div>
            {sub && <div className="text-[14px] leading-[1.45] text-[#5f574b] [text-wrap:pretty]">{sub}</div>}
          </div>
          <button
            type="button"
            onClick={close}
            disabled={pending}
            aria-label={safe?.label ?? 'Close'}
            className="-mr-1.5 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f0e8db] text-[#1e1a15] transition disabled:opacity-35"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {figure && (
          <div className="flex items-center gap-3 rounded-[18px] border border-[#ebe2d2] bg-white px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold">{figure.label}</div>
              {figure.meta && <div className="text-[13px] text-[#5f574b]">{figure.meta}</div>}
            </div>
            <div className="shrink-0 font-display text-[20px] font-extrabold tabular-nums">{figure.amount}</div>
          </div>
        )}

        {!!rows?.length && (
          <div className="overflow-hidden rounded-[18px] border border-[#ebe2d2] bg-white">
            {rows.map((r) => (
              <div key={r.k} className="flex items-baseline gap-3 border-b border-[#f1e9db] px-4 py-2.5 last:border-b-0">
                <span className="w-[92px] shrink-0 text-[13px] text-[#5f574b]">{r.k}</span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                  {r.from && (
                    <>
                      <span className="text-[14px] text-[#8f8676] line-through">{r.from}</span>
                      <Icon name="arrow_forward" size={15} className="text-[#8f8676]" />
                    </>
                  )}
                  <span className="text-[15px] font-semibold">{r.to}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {!!truths?.length && (
          <div className="flex flex-col gap-2">
            {truths.map((t) => (
              <div
                key={t.title}
                className={`flex items-start gap-3 rounded-[18px] border px-3.5 py-3.5 ${t.ok ? 'border-[#ebe2d2] bg-white' : 'border-[#eedfb5] bg-[#faf3e7]'}`}
              >
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${t.ok ? 'bg-[#f2e5b9]' : 'bg-white'}`}>
                  <Icon name={t.ok ? 'check' : 'warning'} size={18} className={t.ok ? 'text-[#1e1a15]' : 'text-[#c8412e]'} />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">{t.title}</div>
                  <div className="text-[13px] leading-[1.45] text-[#5f574b]">{t.body}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {body && <div className="text-[15px] leading-[1.45] text-[#3a352d] [text-wrap:pretty]">{body}</div>}

        {typedWord && (
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[11px] font-bold uppercase tracking-[1.5px] text-[#5f574b]">
              TYPE {typedWord} TO CONFIRM
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={pending}
              autoCapitalize="characters"
              autoComplete="off"
              className={`h-[52px] rounded-[16px] border-[1.5px] bg-white px-4 font-display text-[17px] font-bold tracking-[2px] outline-none disabled:opacity-60 ${
                typed && typedOk ? 'border-[#d4af37]' : 'border-[#e3d8c5]'
              }`}
            />
          </label>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-[16px] border border-[#eedfb5] bg-[#faf3e7] px-3.5 py-3">
            <Icon name={error.icon} size={20} className="mt-px shrink-0 text-[#c8412e]" />
            <div className="flex flex-col gap-0.5">
              <div className="text-[15px] font-semibold">{error.title}</div>
              <div className="text-[14px] leading-[1.45] text-[#5f574b]">{error.body}</div>
            </div>
          </div>
        )}

        <div className="mt-0.5 flex flex-col gap-2.5">
          {actions.map((a) => {
            const go = a.role === 'go';
            const spinning = pending && go;
            const off = pending || (go && (!typedOk || a.disabled));
            const label = spinning
              ? (a.busyLabel ?? 'Working…')
              : go && error && retryLabel
                ? retryLabel
                : a.label;
            return (
              <button
                key={a.id}
                type="button"
                disabled={off}
                aria-busy={spinning || undefined}
                onClick={() => {
                  if (pending || guard?.locked) return;
                  if (go && (!typedOk || a.disabled)) return;
                  onAction?.(a.id);
                }}
                className={actionClass(a.kind, spinning ? 'busy' : off ? 'off' : 'idle')}
              >
                {spinning ? <Spinner /> : a.icon ? <Icon name={a.icon} size={18} /> : null}
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {note && <div className="text-center text-[13px] leading-[1.45] text-[#5f574b] [text-wrap:pretty]">{note}</div>}

        {pending && (
          <div className="flex items-center justify-center gap-1.5 text-[12px] text-[#5f574b]">
            <Icon name="lock" size={15} />
            {pendingNote}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
