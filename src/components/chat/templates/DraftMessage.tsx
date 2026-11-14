'use client';
// draft.message — design/ai-templates/DraftMessage.dc.html (revised). Which of the
// eleven states a state/channel/device triple shows is resolveDraftMessageState()
// in lib/templates/props.ts; this card only draws the answer. The body is the
// string it is given: it never writes, formats or recomputes a dollar amount.
import { useEffect, useRef, useState } from 'react';
import { MONO, Sym, tap } from './shared';
import { OPEN_WAIT_MS, smsHref } from './draft-message-view';
import { resolveDraftMessageState, type DraftMessageProps, type DraftMessageState } from '@/lib/templates/props';
import type { DraftMessageCallbacks } from '@/lib/templates/callbacks';
import './templates.css';

type Mode = DraftMessageState | 'sending';

const MONT = 'var(--font-montserrat), Montserrat, sans-serif';
const ELLIPSIS = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const DASH = '1.5px dashed var(--tpl-field-border)';
const HEAD = { padding: 16, display: 'flex', gap: 12, alignItems: 'center' } as const;
const TILE = { width: 44, height: 44, borderRadius: 14, background: 'var(--tpl-gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' } as const;
const TITLE = { fontSize: 17, fontWeight: 700, ...ELLIPSIS } as const;
const SUB = { fontSize: 14, color: 'var(--tpl-muted)' } as const;

export default function DraftMessage({
  state = 'draft', channel: channelProp = 'Text', device = 'phone',
  recipientName, phone, email, aboutLabel, aboutAmount, body: bodyProp,
  onSend, onOpenMessages, onCopy, onMarkDone, onEdit, onCancel, onAddContact,
}: DraftMessageProps & DraftMessageCallbacks) {
  const [mode, setMode] = useState<Mode>(state);
  const [channel, setChannel] = useState(channelProp);
  const [edited, setEdited] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const busy = useRef(false); // synchronous: a repeat tap on Send or Open never fires twice
  const cleanup = useRef<(() => void) | null>(null);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setMode(state);
    setCopyFailed(false);
    busy.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  useEffect(() => { if (!first.current) setChannel(channelProp); }, [channelProp]);
  useEffect(() => () => cleanup.current?.(), []);

  const isText = channel === 'Text';
  const laptop = device === 'laptop';
  const m: Mode = mode === 'sending' ? 'sending' : resolveDraftMessageState(mode, channel, device);
  const name = recipientName;
  const firstName = name.split(' ')[0];
  const contact = isText ? phone : email;
  const body = edited ?? bodyProp;
  const noC = m === 'nocontact';
  const sending = m === 'sending';
  const handoff = m === 'opened' || m === 'copied';
  const finished = m === 'sent' || m === 'done';
  const textDraftLike = isText && (m === 'draft' || m === 'openError' || m === 'copyError' || noC);

  const send = () => {
    if (busy.current) return;
    busy.current = true;
    setMode('sending');
    onSend?.(body);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      setCopyFailed(true); // not copied, so do not say it was
      return;
    }
    setCopyFailed(false);
    onCopy?.();
    setMode('copied');
  };
  const openMessages = () => {
    if (busy.current) return;
    const href = smsHref(phone, body);
    if (!href) { setMode('openError'); return; }
    busy.current = true;
    onOpenMessages?.();
    // The device either leaves the page for Messages or nothing happens; there is no other signal.
    const left = () => { done(); setMode('opened'); busy.current = false; };
    const timer = setTimeout(() => { done(); setMode('openError'); busy.current = false; }, OPEN_WAIT_MS);
    const onVis = () => { if (document.visibilityState === 'hidden') left(); };
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', left);
      cleanup.current = null;
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', left);
    cleanup.current = done;
    window.location.href = href;
  };

  let primaryLabel = 'Send', primaryIcon = 'send', onPrimary: () => void = () => { if (!noC) send(); };
  if (isText && !laptop) { primaryLabel = 'Open in Messages'; primaryIcon = 'open_in_new'; onPrimary = () => { if (!noC) openMessages(); }; }
  if (isText && laptop) { primaryLabel = 'Copy text'; primaryIcon = 'content_copy'; onPrimary = () => { if (!noC) void copy(); }; }
  if (m === 'openError') { primaryLabel = 'Copy text'; primaryIcon = 'content_copy'; onPrimary = () => void copy(); }
  if (m === 'editing') { primaryLabel = 'Done'; primaryIcon = 'check'; onPrimary = () => setMode('draft'); }
  if (m === 'error') { primaryLabel = 'Try again'; primaryIcon = 'refresh'; onPrimary = send; }
  if (sending) { primaryLabel = 'Sending…'; primaryIcon = 'progress_activity'; onPrimary = () => {}; }
  if (handoff) { primaryLabel = 'Mark done'; primaryIcon = 'check'; onPrimary = () => { setMode('done'); onMarkDone?.(); }; }

  let secondary: { label: string; icon: string; on: () => void } | null = null;
  if (m === 'draft' || m === 'error' || m === 'openError' || m === 'copyError' || noC) secondary = { label: 'Edit', icon: 'edit', on: () => { setMode('editing'); onEdit?.(body); } };
  if (m === 'opened') secondary = { label: 'Reopen', icon: 'open_in_new', on: openMessages };
  if (m === 'copied') secondary = { label: 'Copy again', icon: 'content_copy', on: () => void copy() };

  const fullRow = isText && !laptop && textDraftLike; // phone + Text: the longer primary gets its own row above Cancel / Edit
  const chip = (on: boolean) => on
    ? { bg: 'var(--tpl-thumb-on)', fg: 'var(--tpl-chip-on-fg)', border: 'var(--tpl-thumb-on)' }
    : { bg: 'var(--tpl-white)', fg: 'var(--tpl-ink)', border: 'var(--tpl-btn-border)' };
  const cancel = () => {
    if (m === 'editing') { setMode('draft'); setEdited(null); } else { setMode('cancelled'); onCancel?.(); }
  };
  const showFooter = m !== 'loading' && !finished;

  const head = (icon: string, title: string, sub: string) => (
    <div style={HEAD}>
      <div style={TILE}><Sym name={icon} size={22} color="var(--tpl-avatar-ink)" /></div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={TITLE}>{title}</div>
        <div style={SUB}>{sub}</div>
      </div>
    </div>
  );

  return (
    <div data-template="draft.message" data-state={state} style={{ width: '100%', fontFamily: 'var(--font-inter), Inter, sans-serif', lineHeight: 'normal', color: 'var(--tpl-ink)' }}>
      {m === 'cancelled' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', border: '1.5px dashed var(--tpl-btn-border)', borderRadius: 20, fontSize: 14, color: 'var(--tpl-muted-2)' }}>
          <span>{`Draft to ${firstName} discarded. Nothing was sent.`}</span>
          <span {...tap(() => setMode('draft'))} style={{ color: 'var(--tpl-gold-ink)', fontWeight: 600, cursor: 'pointer' }}>Undo</span>
        </div>
      )}

      {m !== 'cancelled' && (
        <div style={{ background: 'var(--tpl-card)', border: '1.5px solid var(--tpl-card-border)', borderRadius: 24, overflow: 'hidden' }}>
          {!finished && !handoff && head(
            isText ? 'sms' : 'mail',
            `Message for ${firstName}`,
            !isText ? "Nothing's sent until you tap Send." : laptop ? 'Copy it, then send it from your phone.' : 'Opens in Messages. You send it from there.',
          )}
          {handoff && head(
            m === 'opened' ? 'open_in_new' : 'content_copy',
            m === 'opened' ? 'Opened in Messages' : 'Text copied',
            m === 'opened' ? `Send it to ${firstName} there. On It can't see if it went.` : `Paste it into your messaging app to send to ${firstName}.`,
          )}
          {finished && (
            <div style={HEAD}>
              <span
                aria-hidden
                className="material-symbols-outlined"
                style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--tpl-gold)', color: 'var(--tpl-ink)', fontSize: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', animation: 'onitPop 420ms cubic-bezier(.2,.9,.3,1.25) both' }}
              >
                check
              </span>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={TITLE}>{m === 'done' ? 'Marked done' : `Sent to ${firstName}`}</div>
                <div style={SUB}>{m === 'done' ? `You sent it · ${phone}` : `${channel} · ${contact} · just now`}</div>
              </div>
            </div>
          )}

          {m === 'loading' && (
            <div style={{ padding: '0 16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ height: 12, width: '70%', borderRadius: 6, background: 'var(--tpl-skel)' }} />
              <div style={{ height: 96, borderRadius: 16, background: 'var(--tpl-skel-light)' }} />
              <div style={{ height: 44, width: '40%', alignSelf: 'flex-end', borderRadius: 999, background: 'var(--tpl-skel)' }} />
            </div>
          )}

          {m !== 'loading' && (
            <>
              <div style={{ padding: '0 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: DASH }}>
                  <div style={{ fontSize: 15, color: 'var(--tpl-eyebrow)', flex: 'none' }}>To</div>
                  <div style={{ minWidth: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, maxWidth: '100%', ...ELLIPSIS }}>{name}</div>
                    <div style={{ fontSize: 13, maxWidth: '100%', color: noC ? 'var(--tpl-red)' : 'var(--tpl-muted)', ...ELLIPSIS }}>{noC ? 'No phone or email on file' : contact}</div>
                  </div>
                </div>
                {!finished && !handoff && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: DASH }}>
                    <div style={{ fontSize: 15, color: 'var(--tpl-eyebrow)' }}>Send by</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['Text', 'Email'] as const).map((c) => {
                        const k = chip(channel === c);
                        return (
                          <div
                            key={c}
                            {...tap(() => setChannel(c))}
                            style={{ boxSizing: 'content-box', display: 'inline-flex', alignItems: 'center', gap: 5, height: 38, padding: '0 14px', borderRadius: 999, fontSize: 14, fontWeight: 600, border: `1.5px solid ${k.border}`, background: k.bg, color: k.fg }}
                          >
                            <Sym name={c === 'Text' ? 'sms' : 'mail'} size={16} />
                            {c}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {aboutLabel !== '' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: DASH }}>
                    <div style={{ fontSize: 15, color: 'var(--tpl-eyebrow)', flex: 'none' }}>About</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                      <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--tpl-muted-2)', whiteSpace: 'nowrap' }}>{aboutLabel + ' ·'}</span>
                      <span style={{ fontFamily: MONT, fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>{aboutAmount}</span>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: '4px 16px 14px' }}>
                {m === 'editing' ? (
                  <textarea
                    value={body}
                    onChange={(e) => setEdited(e.target.value)}
                    rows={6}
                    style={{ width: '100%', boxSizing: 'border-box', border: '2px solid var(--tpl-gold)', boxShadow: '0 0 0 4px var(--tpl-gold-soft)', borderRadius: 16, padding: '12px 14px', fontFamily: 'var(--font-inter), Inter, sans-serif', fontSize: 15, lineHeight: 1.45, color: 'var(--tpl-ink)', background: 'var(--tpl-white)', resize: 'vertical', outline: 'none' }}
                  />
                ) : (
                  <div style={{ border: '1.5px solid var(--tpl-field-border)', borderRadius: 16, padding: '12px 14px', background: 'var(--tpl-white)', fontSize: 15, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text', color: finished || handoff ? 'var(--tpl-muted-2)' : 'var(--tpl-ink)' }}>{body}</div>
                )}
              </div>
            </>
          )}

          {noC && (
            <div style={{ background: 'var(--tpl-nocontact-bg)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.4, color: 'var(--tpl-ink)' }}>
                <Sym name="contact_phone" size={18} color="var(--tpl-muted-2)" />
                <span>{`No phone or email on file for ${firstName}. Add one to send this.`}</span>
              </div>
              <div style={{ display: 'flex' }}>
                <div {...tap(onAddContact)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: '0 18px', borderRadius: 999, background: 'var(--tpl-gold)', fontSize: 15, fontWeight: 600 }}>
                  <Sym name="person_add" size={18} />
                  Add phone or email
                </div>
              </div>
            </div>
          )}

          {(m === 'error' || m === 'openError' || m === 'copyError' || copyFailed) && (
            <div style={{ background: 'var(--tpl-red-soft)', padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.4, color: 'var(--tpl-fail-ink)' }}>
              <Sym name="error" size={18} />
              <span>{copyFailed || m === 'copyError' ? "Couldn't copy. Select the text and copy it." : m === 'openError' ? "Couldn't open Messages on this device. Copy the text and paste it into any messaging app." : `Didn't send. The number for ${firstName} may be wrong. Your draft is saved.`}</span>
            </div>
          )}

          {showFooter && (
            <div style={{ padding: '12px 16px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: fullRow ? 'wrap' : 'nowrap' }}>
              {!handoff && (
                <div {...tap(cancel)} style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: 15, fontWeight: 600, color: 'var(--tpl-muted-2)' }}>{m === 'editing' ? 'Discard edits' : 'Cancel'}</div>
              )}
              {!handoff && <div style={{ flex: 1 }} />}
              {secondary && (
                <div {...tap(secondary.on)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, padding: '0 16px', borderRadius: 999, border: '1.5px solid var(--tpl-btn-border)', background: 'var(--tpl-white)', fontSize: 15, fontWeight: 600, boxSizing: 'border-box', flex: handoff ? '1 1 auto' : '0 0 auto' }}>
                  <Sym name={secondary.icon} size={18} />
                  <span style={{ whiteSpace: 'nowrap' }}>{secondary.label}</span>
                </div>
              )}
              <div
                {...tap(onPrimary)}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, padding: '0 18px', borderRadius: 999, fontSize: 15, fontWeight: 600, boxSizing: 'border-box', flex: fullRow ? '1 1 100%' : handoff ? '1 1 auto' : '0 0 auto', order: fullRow ? -1 : 0, background: noC ? 'var(--tpl-gold-soft)' : 'var(--tpl-gold)', color: noC ? 'var(--tpl-send-off-fg)' : 'var(--tpl-ink)' }}
              >
                <Sym name={primaryIcon} size={18} style={sending ? { animation: 'onitSpin .9s linear infinite' } : undefined} />
                <span style={{ whiteSpace: 'nowrap' }}>{primaryLabel}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
