// The template's "Extra info" (UI-REDESIGN-AUDIT §1.4; merge 2 · 2·12a).
// Free text the user types or builds from chips. It becomes the document's
// notes as written, and two things are read out of it on the device — no AI:
//   deposit: "50% deposit" / "deposit 50%" / "50 percent deposit" → percentage;
//            "$200 deposit" / "deposit $200"                        → fixed
//   due:     "Due Friday" (the next Friday; a week out if it's Friday today),
//            "Due today" / "Due tomorrow", "Due in 14 days" / "Due in 2 weeks"
// The deposit spelling is 'percentage' (the DB check rejects 'percent').

export const EXTRA_MAX = 500;

export type ExtraInfo = {
  deposit: { type: 'percentage' | 'fixed'; value: number } | null;
  /** YYYY-MM-DD in the device's time zone. */
  due: string | null;
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function parseExtraInfo(text: string, today: Date = new Date()): ExtraInfo {
  const t = text.toLowerCase();
  let deposit: ExtraInfo['deposit'] = null;
  const pct = t.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)\s*(?:deposit|down|up\s*front)/) ?? t.match(/(?:deposit|down)\s*(?:of\s*)?(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)/);
  if (pct) {
    const v = Number(pct[1]);
    if (v > 0 && v <= 100) deposit = { type: 'percentage', value: v };
  } else {
    const fixed = t.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)\s*(?:deposit|down|up\s*front)/) ?? t.match(/(?:deposit|down)\s*(?:of\s*)?\$\s?(\d[\d,]*(?:\.\d{1,2})?)/);
    if (fixed) {
      const v = Number(fixed[1].replace(/,/g, ''));
      if (v > 0 && v <= 10_000_000) deposit = { type: 'fixed', value: v };
    }
  }

  let due: string | null = null;
  const inN = t.match(/due\s+in\s+(\d{1,3})\s*(day|days|week|weeks)\b/);
  const wd = t.match(/due\s+(?:on\s+|this\s+|next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/);
  if (inN) {
    const n = Number(inN[1]) * (inN[2].startsWith('week') ? 7 : 1);
    if (n > 0 && n <= 366) due = ymd(addDays(today, n));
  } else if (/due\s+today\b/.test(t)) {
    due = ymd(today);
  } else if (/due\s+tomorrow\b/.test(t)) {
    due = ymd(addDays(today, 1));
  } else if (wd) {
    const target = WEEKDAYS.findIndex((d) => d.startsWith(wd[1].slice(0, 3)));
    if (target >= 0) {
      const diff = (target - today.getDay() + 7) % 7 || 7;
      due = ymd(addDays(today, diff));
    }
  }
  return { deposit, due };
}

/** Add a chip's phrase to the text: on its own line, never twice. */
export function addPhrase(text: string, phrase: string): string {
  if (text.toLowerCase().includes(phrase.toLowerCase())) return text;
  const base = text.replace(/\s+$/, '');
  return (base ? `${base}\n${phrase}` : phrase).slice(0, EXTRA_MAX);
}
