/** Format a date string or object consistently across all document templates and views. */
export function formatDate(val: string | Date | null | undefined): string {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return `${val.getMonth() + 1}/${val.getDate()}/${val.getFullYear()}`;
  }
  const str = String(val).trim();
  if (!str) return '';
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${Number(m)}/${Number(d)}/${y}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getMonth() + 1}/${parsed.getDate()}/${parsed.getFullYear()}`;
  }
  return str;
}

// Default invoice due date: issue date + 30 days, local time, ISO yyyy-mm-dd —
// matches the invoices.due_date `date` column and the AI's due_date format.
// Single definition so every invoice-creation path shares the same default.
export function defaultDueDate(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 30);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
