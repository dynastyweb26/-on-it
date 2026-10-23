'use client';

// Sign sheet (design spec §2.3): bottom sheet, Draw/Type tabs, name field,
// consent checkbox, and the one POST to /api/public/estimates/[token]/sign.
import { useRef, useState } from 'react';
import { CONSENT_VERSION } from '@/lib/estimates/consent';
import type { PublicEstimate, SignatureSummary } from '@/lib/estimates/types';
import EstIcon from './EstIcon';
import SignaturePad, { type SignaturePadHandle } from './SignaturePad';
import {
  CONSENT_HELPER,
  CONSENT_LABEL,
  itemsLabel,
  sheetSubtitle,
  signErrorCopy,
  stillNeeded,
  stillNeededText,
} from './model';
import s from './estimate.module.css';

export type SignOutcome =
  | { kind: 'approved'; signature: SignatureSummary }
  | { kind: 'content_changed' }
  | { kind: 'reload' };

type Tab = 'draw' | 'type';

export default function SignSheet({
  payload,
  token,
  preview,
  onClose,
  onOutcome,
}: {
  payload: PublicEstimate;
  token: string;
  preview: boolean;
  onClose: () => void;
  onOutcome: (outcome: SignOutcome) => void;
}) {
  const [tab, setTab] = useState<Tab>('draw');
  const [drawn, setDrawn] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle | null>(null);

  const draft = {
    hasInk: tab === 'draw' ? drawn !== null : name.trim().length > 0,
    name,
    agreed,
  };
  const missing = stillNeeded(draft);
  const canSubmit = missing.length === 0 && !submitting && !preview;
  const canClear = tab === 'draw' ? drawn !== null : name.length > 0;

  function clear() {
    if (tab === 'draw') {
      padRef.current?.clear();
      setDrawn(null);
    } else {
      setName('');
    }
    setError(null);
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/estimates/${encodeURIComponent(token)}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          signer_name: name.trim(),
          signature_type: tab,
          ...(tab === 'draw' && drawn ? { signature_data: drawn } : {}),
          // Exactly what is on screen (label + helper), the frozen version, and
          // the hash of the content the signer is looking at.
          consent_text: `${CONSENT_LABEL} ${CONSENT_HELPER}`,
          consent_version: CONSENT_VERSION,
          expected_hash: payload.contentHash,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { signature?: SignatureSummary; code?: string }
        | null;
      if (res.ok && data?.signature) {
        onOutcome({ kind: 'approved', signature: data.signature });
        return;
      }
      const mapped = signErrorCopy(res.status, data?.code);
      if (mapped.kind === 'content_changed' || mapped.kind === 'reload') {
        onOutcome({ kind: mapped.kind });
        return;
      }
      setError(mapped.message);
    } catch {
      setError("Couldn't approve. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={s.scrim}
      role="presentation"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.grabHandle} aria-hidden />

        <div className={s.sheetHead}>
          <div>
            <h2 className={s.sheetTitle} id="sign-sheet-title">
              Sign estimate
            </h2>
            <p className={s.sheetSub}>{sheetSubtitle(payload)}</p>
          </div>
          <button
            type="button"
            className={s.iconButton}
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <EstIcon name="close" size={24} />
          </button>
        </div>

        <div className={s.tabs} role="tablist" aria-label="Signature method">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'draw'}
            className={`${s.tab} ${tab === 'draw' ? s.tabActive : ''}`}
            onClick={() => setTab('draw')}
            disabled={submitting}
          >
            <EstIcon name="draw" size={18} />
            Draw
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'type'}
            className={`${s.tab} ${tab === 'type' ? s.tabActive : ''}`}
            onClick={() => setTab('type')}
            disabled={submitting}
          >
            <EstIcon name="keyboard" size={18} />
            Type
          </button>
        </div>

        {tab === 'draw' ? (
          <SignaturePad
            ref={padRef}
            onChange={(data) => {
              setDrawn(data);
            }}
          />
        ) : (
          <div className={s.typeBox}>
            {name.trim() ? (
              <span className={s.typedName} aria-hidden>
                {name.trim()}
              </span>
            ) : (
              <span className={s.typePlaceholder}>Type your name below to sign</span>
            )}
          </div>
        )}

        <div className={s.hintRow}>
          <span>{tab === 'draw' ? 'Draw your signature in the box' : 'Your typed name is your signature'}</span>
          <button type="button" className={s.clearButton} onClick={clear} disabled={!canClear || submitting}>
            <EstIcon name="restart_alt" size={18} />
            Clear
          </button>
        </div>

        <div className={s.field}>
          <label className={s.fieldLabel} htmlFor="signer-name">
            Full legal name
          </label>
          <input
            id="signer-name"
            className={s.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jordan Ellis"
            autoComplete="name"
            maxLength={120}
            disabled={submitting}
          />
        </div>

        {payload.attachments.length > 0 && (
          <p className={s.includesLine}>
            <EstIcon name="attach_file" size={18} />
            Includes {itemsLabel(payload.attachments.length)} attachments
          </p>
        )}

        <div className={s.checkRow}>
          <input
            id="sign-consent"
            type="checkbox"
            className={s.checkbox}
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={submitting}
          />
          <label className={s.checkLabel} htmlFor="sign-consent">
            {CONSENT_LABEL}
          </label>
        </div>
        <p className={s.helper}>{CONSENT_HELPER}</p>

        {missing.length > 0 && !submitting && <p className={s.stillNeeded}>{stillNeededText(draft)}</p>}

        {error && (
          <p className={s.errorLine} role="alert">
            {error}
          </p>
        )}

        <button type="button" className={s.submit} onClick={submit} disabled={!canSubmit}>
          {submitting ? (
            <>
              <span className={s.spinner} aria-hidden />
              Approving…
            </>
          ) : (
            'Approve estimate'
          )}
        </button>
      </div>
    </div>
  );
}
