'use client';
// PopInline — the kit's transcript card.
// Board: design/popups/boards/PopInline.dc.html (renderVals / BTN / KIND).
//
// Four kinds: bubble, card, error card, error slot (inside a form card).
// A guard prompt cannot be dismissed — there is no scrim, no ×, and Escape is
// not wired — so the question stays until it is answered. Buttons are refused
// while pending, using the caller's synchronous TapLock when one is passed.
import { useState } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { TapLock } from './action-guard';
import type { PopupError } from './error-frame';
import Spinner from './Spinner';

export type PopInlineKind = 'bubble' | 'card' | 'error' | 'slot';
export type PopInlineAction = {
  id: string;
  label: string;
  kind?: 'gold' | 'danger' | 'outline' | 'dark' | 'text';
  /** The action that runs (and retries). Others are alternate choices. */
  go?: boolean;
  busyLabel?: string;
  icon?: IconName;
  disabled?: boolean;
};

const KIND: Record<PopInlineKind, string> = {
  bubble: 'w-auto max-w-[85%] rounded-[20px] border border-[#e3d8c5] bg-[#f0e8db] px-4 py-3',
  card: 'w-full rounded-[24px] border border-[#eedfb5] bg-[#faf3e7] p-4',
  error: 'w-auto max-w-[90%] rounded-[20px] border border-[#eedfb5] bg-[#faf3e7] px-4 py-3.5',
  slot: 'w-full rounded-[24px] border border-[#ebe2d2] bg-white p-4',
};

/** Inline buttons are 48px (44 for text), radius 24 — the board's BTN table. */
function actionClass(kind: PopInlineAction['kind'] = 'outline', state: 'idle' | 'busy' | 'off' = 'idle'): string {
  const height = kind === 'text' ? 'h-11' : 'h-12';
  const base = `flex items-center justify-center gap-2 rounded-[24px] px-[18px] font-bold text-[15px] transition active:scale-[.97] disabled:active:scale-100 ${height}`;
  if (state === 'busy') return `${base} bg-[#efe7da] text-[#3a352d]`;
  if (state === 'off') return `${base} bg-[#efe7da] text-[#8f8676]`;
  switch (kind) {
    case 'gold': return `${base} bg-[#d4af37] font-display text-[#1e1a15]`;
    case 'danger': return `${base} border-[1.5px] border-[#e3d8c5] bg-white font-display text-[#c8412e]`;
    case 'dark': return `${base} bg-[#34302a] font-display text-[#fdf8f1]`;
    case 'text': return `${base} bg-transparent font-body text-[#3a352d]`;
    default: return `${base} border-[1.5px] border-[#e3d8c5] bg-white font-body text-[#1e1a15]`;
  }
}

export default function PopInline({
  kind = 'card',
  eyebrow,
  eyebrowIcon = 'description',
  summary,
  icon,
  title,
  text,
  rows,
  choices,
  alert = null,
  retryLabel,
  actions,
  row = false,
  caption,
  chips,
  thumbs = false,
  onVote,
  doneText,
  onReplay,
  pending = false,
  guard,
  onAction,
  onChip,
}: {
  kind?: PopInlineKind;
  eyebrow?: string;
  eyebrowIcon?: IconName;
  /** A headline figure block above the question (convert, change guard). */
  summary?: Array<{ k: string; v: string; big?: boolean }>;
  icon?: IconName;
  title?: string;
  text?: string;
  /** Before → after lines. */
  rows?: Array<{ k: string; from?: string; to: string }>;
  /** A list of alternate answers (which client? which invoice?). */
  choices?: Array<{ id: string; label: string; sub?: string; icon?: IconName }>;
  alert?: Pick<PopupError, 'title' | 'body' | 'icon'> | null;
  /** The go button's label once a failure unlocked it. */
  retryLabel?: string;
  actions?: PopInlineAction[];
  /** Actions side by side instead of stacked. */
  row?: boolean;
  caption?: string;
  /** Quick replies under the card. */
  chips?: Array<{ label: string; icon?: IconName }>;
  /** The answer's feedback buttons (AI replies). */
  thumbs?: boolean;
  onVote?: (vote: 'up' | 'down' | null) => void;
  /** The outcome, as a follow-up bubble once the prompt is answered. */
  doneText?: string;
  onReplay?: () => void;
  pending?: boolean;
  guard?: TapLock;
  onAction?: (id: string) => void;
  onChip?: (label: string) => void;
}) {
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const isCard = kind === 'card' || kind === 'slot';
  const locked = pending || !!guard?.locked;

  const tap = (a: PopInlineAction) => {
    if (pending || guard?.locked) return;
    if (a.go && a.disabled) return;
    onAction?.(a.id);
  };

  return (
    <div className="flex w-full flex-col items-start gap-2.5">
      <div role={alert ? 'alert' : 'group'} aria-busy={pending || undefined} className={`flex flex-col gap-3 ${KIND[kind]}`}>
        {eyebrow && (
          <div className="flex items-center gap-2">
            <Icon name={eyebrowIcon} size={20} className="text-[#735c00]" />
            <span className="font-display text-[12px] font-bold uppercase tracking-[1.5px] text-[#735c00]">{eyebrow}</span>
          </div>
        )}

        {!!summary?.length && (
          <div className="flex flex-col gap-1.5 border-b border-[#f1e9db] pb-3">
            {summary.map((m) => (
              <div key={m.k} className="flex items-baseline justify-between gap-3">
                <span className={m.big ? 'font-display text-[20px] font-extrabold tabular-nums' : 'text-[14px] font-medium text-[#3a352d]'}>
                  {m.k}
                </span>
                <span className={m.big ? 'font-display text-[20px] font-extrabold tabular-nums' : 'text-[14px] font-medium text-[#3a352d]'}>
                  {m.v}
                </span>
              </div>
            ))}
          </div>
        )}

        {(title || text) && (
          <div className="flex items-start gap-3">
            {icon && (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#f2e5b9]">
                <Icon name={icon} size={20} className="text-[#1e1a15]" />
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-[3px]">
              {title && (
                <div className={isCard
                  ? 'font-display text-[19px] font-extrabold leading-[1.25] [text-wrap:pretty]'
                  : 'text-[16px] font-semibold leading-[1.25] [text-wrap:pretty]'}>
                  {title}
                </div>
              )}
              {text && (
                <div className={`leading-[1.45] [text-wrap:pretty] ${kind === 'bubble' ? 'text-[16px]' : 'text-[15px] text-[#3a352d]'}`}>
                  {text}
                </div>
              )}
            </div>
          </div>
        )}

        {!!rows?.length && (
          <div className="overflow-hidden rounded-[16px] border border-[#ebe2d2] bg-white">
            {rows.map((r) => (
              <div key={r.k} className="flex items-baseline gap-3 border-b border-[#f1e9db] px-3.5 py-[11px] last:border-b-0">
                <span className="w-[68px] shrink-0 text-[13px] text-[#5f574b]">{r.k}</span>
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

        {!!choices?.length && (
          <div className="overflow-hidden rounded-[16px] border border-[#ebe2d2] bg-white">
            {choices.map((c, i) => (
              <button
                key={c.id}
                type="button"
                disabled={locked}
                onClick={() => {
                  if (pending || guard?.locked) return;
                  onAction?.(c.id);
                }}
                className="flex min-h-[58px] w-full items-center gap-3 border-b border-[#f1e9db] px-3.5 py-2.5 text-left transition last:border-b-0 active:bg-[#faf3e7] disabled:text-[#8f8676]"
              >
                <Icon name={c.icon ?? 'person'} size={20} className="shrink-0 text-[#5f574b]" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] font-semibold">{c.label}</span>
                  {c.sub && <span className="text-[13px] text-[#5f574b]">{c.sub}</span>}
                </span>
                {pending && i === 0 && <Spinner />}
              </button>
            ))}
          </div>
        )}

        {alert && (
          <div
            role="alert"
            className={`flex items-start gap-2.5 rounded-[16px] border border-[#eedfb5] px-3.5 py-3 ${kind === 'slot' ? 'bg-[#faf3e7]' : 'bg-white'}`}
          >
            <Icon name={alert.icon} size={20} className="shrink-0 text-[#c8412e]" />
            <div className="flex flex-col gap-0.5">
              {alert.title && <div className="text-[15px] font-semibold">{alert.title}</div>}
              <div className="text-[14px] leading-[1.45] text-[#3a352d]">{alert.body}</div>
            </div>
          </div>
        )}

        {!!actions?.length && (
          <div className={`flex flex-wrap gap-2 ${row ? 'flex-row' : 'flex-col'}`}>
            {actions.map((a) => {
              const spinning = pending && a.go;
              const off = locked || a.disabled;
              const label = spinning
                ? (a.busyLabel ?? 'Working…')
                : a.go && alert && retryLabel
                  ? retryLabel
                  : a.label;
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={off}
                  aria-busy={spinning || undefined}
                  onClick={() => tap(a)}
                  className={actionClass(a.kind, spinning ? 'busy' : off ? 'off' : 'idle')}
                >
                  {spinning ? <Spinner /> : a.icon ? <Icon name={a.icon} size={18} /> : null}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {caption && <div className="text-center text-[13px] leading-[1.45] text-[#5f574b]">{caption}</div>}
      </div>

      {!!chips?.length && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => onChip?.(c.label)}
              className="flex h-11 items-center gap-1.5 rounded-[22px] border border-[#e3d8c5] bg-white px-4 text-[14px] font-semibold text-[#1e1a15]"
            >
              <Icon name={c.icon ?? 'north_east'} size={17} className="text-[#735c00]" />
              {c.label}
            </button>
          ))}
        </div>
      )}

      {thumbs && (
        <div className="-ml-1.5 flex gap-0.5">
          {(['up', 'down'] as const).map((dir) => {
            const on = vote === dir;
            return (
              <button
                key={dir}
                type="button"
                aria-pressed={on}
                aria-label={dir === 'up' ? 'Good answer' : 'Bad answer'}
                onClick={() => {
                  const next = on ? null : dir;
                  setVote(next);
                  onVote?.(next);
                }}
                className={`grid h-11 w-11 place-items-center rounded-[22px] ${on ? 'bg-[#f2e5b9] text-[#1e1a15]' : 'text-[#8f8676]'}`}
              >
                <Icon name={dir === 'up' ? 'thumb_up' : 'thumb_down'} size={19} />
              </button>
            );
          })}
        </div>
      )}

      {doneText && (
        <div className="flex flex-col items-start gap-2.5">
          <div className="max-w-[85%] rounded-[20px] border border-[#e3d8c5] bg-[#f0e8db] px-4 py-3 text-[15px] leading-[1.4]">
            {doneText}
          </div>
          {onReplay && (
            <button
              type="button"
              onClick={onReplay}
              className="flex h-11 items-center gap-1.5 rounded-[22px] border-[1.5px] border-[#e3d8c5] bg-white px-4 text-[14px] font-semibold"
            >
              <Icon name="refresh" size={18} />
              Replay
            </button>
          )}
        </div>
      )}
    </div>
  );
}
