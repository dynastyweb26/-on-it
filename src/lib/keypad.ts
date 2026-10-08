// The template's number keypads (frames 1i Price, 7d Quantity; merge 2 ·
// 2·11). The custom keypad replaces the OS keyboard for qty and price, so
// the rules live here, tested:
//   quantity: decimal, ≤ 2 decimals, ≤ 7 digits in all; 0 or empty → 1.
//   price:    decimal, ≤ 2 decimals, ≤ 10,000,000; empty → no price.

export type KeypadKind = 'qty' | 'price';
export const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;
export type Key = (typeof KEYS)[number];

const MAX_QTY_DIGITS = 7;
const MAX_PRICE = 10_000_000;

/** The keypad text after one key press (presses that would break a rule are ignored). */
export function pressKey(text: string, key: Key, kind: KeypadKind): string {
  if (key === 'back') return text.slice(0, -1);
  if (key === '.') {
    if (text.includes('.')) return text;
    return text === '' ? '0.' : `${text}.`;
  }
  const [int, dec] = text.split('.');
  if (dec !== undefined && dec.length >= 2) return text;           // ≤ 2 decimals
  let next = text === '0' ? key : text + key;                       // no leading zeros
  if (kind === 'qty' && next.replace('.', '').length > MAX_QTY_DIGITS) return text;
  if (kind === 'price' && Number(next) > MAX_PRICE) return text;
  if (dec === undefined && int.length >= 1 && int === '0') next = key; // "0" then "5" → "5"
  return next;
}

/** Keypad text → stored value. qty: 0 / empty → 1. price: empty → null. */
export function keypadValue(text: string, kind: KeypadKind): number | null {
  const n = Number(text.replace(/\.$/, ''));
  if (kind === 'qty') return text === '' || !Number.isFinite(n) || n <= 0 ? 1 : Math.round(n * 100) / 100;
  if (text === '' || !Number.isFinite(n)) return null;
  return Math.min(MAX_PRICE, Math.round(n * 100) / 100);
}

/** A stored value → keypad starting text ("1.5", "450"). */
export function keypadText(value: number | null): string {
  if (value == null) return '';
  return String(Math.round(value * 100) / 100);
}
