// Line units and descriptions (UI redesign merge 2 · 2·9). A line item may
// carry a unit (each · hour · sq ft · job) and a detail — the "Description ·
// shows on invoices" text from a saved product. Both are optional: older lines
// have neither, and the money math never reads them (amount = qty × price).
// The pay-page RPC applies the same rules server side (migration
// 20261003000003): a unit outside the list is dropped, detail is trimmed and
// capped at 300.

export const LINE_UNITS = ['each', 'hour', 'sq ft', 'job'] as const;
export type LineUnit = (typeof LINE_UNITS)[number];

export const DETAIL_MAX = 300;

export function normalizeLineUnit(u: unknown): LineUnit | null {
  if (typeof u !== 'string') return null;
  const s = u.trim().toLowerCase();
  if ((LINE_UNITS as readonly string[]).includes(s)) return s as LineUnit;
  // Spellings the model or a person might use.
  if (['hr', 'hrs', 'hours'].includes(s)) return 'hour';
  if (['sqft', 'sq. ft.', 'sq.ft.', 'square foot', 'square feet', 'sf'].includes(s)) return 'sq ft';
  return null;
}

export function normalizeLineDetail(d: unknown): string | null {
  if (typeof d !== 'string') return null;
  const t = d.trim();
  return t ? t.slice(0, DETAIL_MAX) : null;
}

/** Short unit label after a quantity: "hr", "sq ft", "job"; none for each. */
export function unitLabel(u: LineUnit | null | undefined): string {
  return u === 'hour' ? 'hr' : u === 'sq ft' ? 'sq ft' : u === 'job' ? 'job' : '';
}

/** "2 hr", "120 sq ft", "1 job", "3" (each / no unit). */
export function qtyText(qty: number, u: LineUnit | null | undefined): string {
  const label = unitLabel(u);
  return label ? `${qty} ${label}` : String(qty);
}

/**
 * A parsed line's unit and detail. The model may report a unit; detail never
 * comes from the model. Anything missing carries over from the draft line with
 * the same description (case-insensitive), so a re-parse never drops a saved
 * product's unit or description.
 */
export function carryUnitDetail(
  description: string,
  modelUnit: unknown,
  draftLines: unknown,
): { unit?: LineUnit; detail?: string } {
  const key = description.trim().toLowerCase();
  const prev = (Array.isArray(draftLines) ? draftLines : []).find(
    (d): d is Record<string, unknown> =>
      !!d && typeof d === 'object' && String((d as Record<string, unknown>).description ?? '').trim().toLowerCase() === key,
  );
  const unit = normalizeLineUnit(modelUnit) ?? normalizeLineUnit(prev?.unit);
  const detail = normalizeLineDetail(prev?.detail);
  return { ...(unit ? { unit } : {}), ...(detail ? { detail } : {}) };
}

export const isLineUnit = (u: unknown): u is LineUnit => (LINE_UNITS as readonly unknown[]).includes(u);
