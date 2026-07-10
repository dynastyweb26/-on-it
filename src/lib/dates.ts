// Default invoice due date: issue date + 30 days, local time, ISO yyyy-mm-dd —
// matches the invoices.due_date `date` column and the AI's due_date format.
// Single definition so every invoice-creation path shares the same default.
export function defaultDueDate(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 30);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
