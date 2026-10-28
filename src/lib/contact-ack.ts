// The confirmation reply must name the client contact fields it captured — and
// only those. The prompt asks the model to do it; this decides what (if
// anything) still needs appending, so a field is never silently dropped.
export type ContactFields = {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Whether the reply already names `value`. Exact-after-punctuation first
 *  ("945-344-4550" covers "9453444550"), then token overlap so the model's own
 *  cleanup counts ("2407 Neff Lane, Forney, TX" covers the dictated
 *  "2407 neff ln forney tx"). Short tokens match by first letter ("ln" ↔
 *  "lane", "tx" ↔ "texas"); the check only suppresses a duplicate echo, so a
 *  slightly loose match is safer than repeating an address the reply said. */
function isSaid(value: string, reply: string): boolean {
  const flat = squash(value);
  if (flat && squash(reply).includes(flat)) return true;
  const valueTokens = words(value);
  if (!valueTokens.length) return true;
  const replyTokens = words(reply);
  return valueTokens.every((t) =>
    replyTokens.some((r) =>
      r === t ||
      (t.length >= 4 && r.length >= 4 && (r.startsWith(t) || t.startsWith(r))) ||
      (t.length <= 3 && r.startsWith(t.charAt(0))),
    ),
  );
}

/** The clause for captured contact fields the reply left out, e.g.
 *  "9453444550, deffeu@gmail.com". Empty when nothing is missing (or nothing
 *  was captured), so a reply never names a field the user didn't give. */
export function missingContactAck(reply: string, fields: ContactFields): string {
  const missing: string[] = [];
  for (const value of [fields.phone, fields.email, fields.address]) {
    const text = (value ?? '').trim();
    if (!text) continue;
    if (!isSaid(text, reply ?? '')) missing.push(text);
  }
  return missing.join(', ');
}
