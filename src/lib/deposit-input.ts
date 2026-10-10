// Text handling for the deposit amount field (components/DepositValueInput).

/** Digits and one dot; leading zeros stripped ("045" → "45", "0.5" stays). */
export function cleanDepositText(raw: string): string {
  let s = raw.replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  return s.replace(/^0+(?=\d)/, '');
}

/** The number a field's text saves as: '' and '.' save 0, never negative. */
export function depositTextToNumber(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** The value a field settles on when you leave it: percentage capped at 100. */
export function settleDeposit(text: string, mode: 'percentage' | 'fixed'): number {
  const n = depositTextToNumber(text);
  return mode === 'percentage' ? Math.min(n, 100) : n;
}
