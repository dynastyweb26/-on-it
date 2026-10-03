// Status tags for a document row (release frames 4a; Design Standard §2:
// always icon + text). Shared by the Invoices list and a client's
// "Invoices & quotes" list. A sent invoice with a due date reads
// "DUE OCT 16"; a viewed one swaps its icon to the eye.
import type { IconName } from '@/components/icon-names';

export type TagDoc = { kind: string; status: string; due_date: string | null; viewed_at?: string | null };

const TAG: Record<string, { cls: string; icon: IconName }> = {
  paid: { cls: 'bg-paid-container text-paid', icon: 'check_circle' },
  sent: { cls: 'bg-primary-soft text-primary-on-container', icon: 'send' },
  overdue: { cls: 'bg-error-container text-on-error-container', icon: 'warning' },
  draft: { cls: 'bg-draft-container text-draft', icon: 'history' },
  void: { cls: 'bg-draft-container text-draft line-through', icon: 'block' },
  converted: { cls: 'bg-surface-container-high text-on-surface-variant', icon: 'sync' },
};

const shortDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

export function tagFor(r: TagDoc, converted: boolean): { key: string; text: string; cls: string; icon: IconName } {
  if (converted) return { key: 'converted', text: 'CONVERTED', ...TAG.converted };
  const base = TAG[r.status] ?? TAG.draft;
  if (r.status === 'sent' && r.kind === 'invoice' && r.due_date) {
    return { key: `due-${r.viewed_at ? 'v' : 's'}`, text: `DUE ${shortDate(r.due_date)}`, ...base, icon: r.viewed_at ? 'visibility' : base.icon };
  }
  if (r.status === 'sent' && r.viewed_at) return { key: 'viewed', text: 'VIEWED', ...base, icon: 'visibility' };
  return { key: r.status, text: r.status.toUpperCase(), ...base };
}
