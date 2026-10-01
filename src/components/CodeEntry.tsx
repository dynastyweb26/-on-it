'use client';
// Access-code entry ("Have a code?"), used by PaywallModal and Settings.
// POSTs /api/redeem; the server does the exact, case-sensitive match, the
// rate limit and the one-per-user rule. On success it calls onRedeemed.
import { useState } from 'react';

export default function CodeEntry({ onRedeemed }: { onRedeemed: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function apply() {
    if (busy || code.trim().length < 3) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        setMessage({ ok: true, text: data.message ?? "You're set. Free access is on." });
        onRedeemed();
      } else {
        setMessage({ ok: false, text: data?.message ?? "That code didn't work." });
      }
    } catch {
      setMessage({ ok: false, text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1"
          // Codes are case-sensitive: no auto-capitalize / autocorrect changing them.
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          placeholder="Enter code"
          aria-label="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void apply(); }}
        />
        <button className="btn-outline shrink-0 px-5" disabled={busy || code.trim().length < 3} onClick={apply}>
          {busy ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-on-surface' : 'text-on-surface-variant'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
