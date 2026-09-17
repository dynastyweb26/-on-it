'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  recordType: 'invoice' | 'quote' | 'expense';
  status?: string;
  busy?: boolean;
}

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  recordType,
  status,
  busy = false,
}: DeleteConfirmModalProps) {
  const [typedConfirm, setTypedConfirm] = useState('');

  if (!isOpen) return null;

  const isSentOrPaid = status === 'sent' || status === 'paid' || status === 'overdue';
  const requiresTypedConfirm = (recordType === 'invoice' || recordType === 'quote') && isSentOrPaid;

  const canConfirm = !requiresTypedConfirm || typedConfirm.trim().toUpperCase() === 'DELETE';

  function handleConfirm() {
    if (!canConfirm || busy) return;
    onConfirm();
    setTypedConfirm('');
  }

  function handleClose() {
    if (busy) return;
    setTypedConfirm('');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-on-background/45 p-4"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Delete ${recordType}`}
        className="w-full max-w-sm rounded-card p-6 shadow-card-raised"
        style={{ backgroundColor: '#fff8f0', animation: 'paywall-in 200ms ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-error-container text-error">
            <Icon name="delete" size={24} />
          </span>
          <div>
            <h2 className="font-display text-lg font-extrabold text-on-background">
              Delete {recordType === 'quote' ? 'Quote' : recordType === 'invoice' ? 'Invoice' : 'Expense'}?
            </h2>
            <p className="truncate text-xs text-on-surface-variant/80">{title}</p>
          </div>
        </div>

        <p className="text-body-md text-on-background">
          {requiresTypedConfirm ? (
            <>
              This record has been <span className="font-semibold">{status}</span>. Deleting it will remove its total from your Books income totals.
            </>
          ) : (
            <>
              Are you sure you want to delete this {recordType}? It will be removed from your list and Books totals.
            </>
          )}
        </p>

        {recordType === 'invoice' && (
          <p className="mt-2 text-xs text-on-surface-variant/80">
            On the free plan this still counts toward your invoice limit — deleting it won&apos;t free up a slot.
          </p>
        )}

        {requiresTypedConfirm && (
          <div className="mt-4 space-y-1">
            <label htmlFor="delete-confirm-input" className="text-xs font-semibold text-on-surface-variant">
              Type <span className="font-bold text-on-background">DELETE</span> to confirm
            </label>
            <input
              id="delete-confirm-input"
              type="text"
              className="input uppercase"
              placeholder="DELETE"
              autoComplete="off"
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
            />
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            className="btn-outline flex-1"
            disabled={busy}
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex flex-1 min-h-touch items-center justify-center gap-1.5 rounded-button bg-error px-4 font-semibold text-white transition active:scale-[0.97] disabled:opacity-40"
            disabled={!canConfirm || busy}
            onClick={handleConfirm}
          >
            <Icon name="delete" size={18} />
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
