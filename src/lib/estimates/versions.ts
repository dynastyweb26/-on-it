// Owner estimate versions (4B-lite). Pure: the caller passes the rows it already
// read with the owner's session client (RLS: own rows only) and the business
// timezone. Nothing here touches Supabase or the network.
import { sentOrApprovedDate } from './owner-view';

/** The version chip reads "v2". v1 is the version every client was sent, so it
 *  carries no badge; anything unusable carries none either. */
export function versionChipLabel(version: number | null | undefined): string | null {
  const v = Number(version ?? 0);
  if (!Number.isInteger(v) || v <= 1) return null;
  return `v${v}`;
}

/** A row of estimate_versions, as the owner's session can read it. */
export type VersionSnapshotRow = {
  version: number;
  /** The jsonb copy taken by bump_estimate_version. */
  content: unknown;
  total?: number | string | null;
  created_at: string | null;
};

/** The newest snapshot below the current version, or null when there is none.
 *  Rows may arrive in any order, and the current version is never "previous". */
export function previousVersionOf<T extends { version: number }>(
  rows: readonly T[],
  current: number | null | undefined,
): T | null {
  const at = Number(current ?? 0);
  if (!Number.isInteger(at) || at <= 1) return null;
  let best: T | null = null;
  for (const row of rows) {
    const version = Number(row.version);
    if (!Number.isInteger(version) || version >= at) continue;
    if (!best || version > Number(best.version)) best = row;
  }
  return best;
}

/** "Editing v2 · v1 sent Nov 7" — the date is the previous snapshot's own. */
export function previousVersionCaption(
  current: number | null | undefined,
  previous: { version: number; created_at: string | null } | null,
  tz?: string | null,
): string | null {
  const here = versionChipLabel(current);
  if (!here || !previous) return null;
  const day = previous.created_at ? sentOrApprovedDate(previous.created_at, tz) : null;
  const sent = day && day !== '—' ? ` sent ${day}` : '';
  return `Editing ${here} · v${Number(previous.version)}${sent}`;
}

export type SnapshotLine = {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
};

/**
 * What the read-only panel draws. Display values only — there is no writable
 * field in this shape, by construction, and `editable` is typed false.
 */
export type SnapshotView = {
  version: number;
  label: string;
  /** "Viewing v1 · Nov 7" */
  viewingLabel: string;
  /** "Back to v2" */
  backLabel: string;
  title: string | null;
  items: SnapshotLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  editable: false;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function amount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function lines(value: unknown): SnapshotLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = record(item);
    const unit = typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : 'each';
    return {
      description: typeof row.description === 'string' ? row.description : '',
      qty: amount(row.qty),
      unit,
      unitPrice: amount(row.unit_price),
    };
  });
}

/** One snapshot turned into the panel's display values. */
export function snapshotView(
  snapshot: VersionSnapshotRow,
  current: number | null | undefined,
  tz?: string | null,
): SnapshotView {
  const content = record(snapshot.content);
  const version = Number(snapshot.version);
  const label = `v${version}`;
  const day = snapshot.created_at ? sentOrApprovedDate(snapshot.created_at, tz) : null;
  const back = versionChipLabel(current);
  return {
    version,
    label,
    viewingLabel: `Viewing ${label}${day && day !== '—' ? ` · ${day}` : ''}`,
    backLabel: back ? `Back to ${back}` : 'Back',
    title: text(content.title),
    items: lines(content.line_items),
    subtotal: amount(content.subtotal),
    taxRate: amount(content.tax_rate),
    taxAmount: amount(content.tax_amount),
    total: amount(content.total ?? snapshot.total),
    notes: text(content.notes),
    editable: false,
  };
}
