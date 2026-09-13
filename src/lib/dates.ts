// Default invoice due date: issue date + 30 days, local time, ISO yyyy-mm-dd —
// matches the invoices.due_date `date` column and the AI's due_date format.
// Single definition so every invoice-creation path shares the same default.
export function defaultDueDate(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 30);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Formats a date string or Date object as M/D/YYYY */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return `${m}/${d}/${y}`;
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return typeof date === 'string' ? date : '';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}
