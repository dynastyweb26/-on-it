'use client';
// The app-open soft upgrade banner (lib/soft-prompts.ts): one slim strip in the
// (app) shell, at most ONE prompt at a time, in the server's priority order.
//
// A flex sibling directly above the tab bar (like InstallBanner), so it never
// covers content, the chat composer or a send/save action; it hides while the
// keyboard is open and is always dismissible. Its frequency cap is per user on
// this device (localStorage), so a 14-day or once cap survives a reload, and
// the prompt is marked seen when shown — a soft prompt is a moment, not a nag.
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import PaywallModal from '@/components/PaywallModal';
import { getSharedUser } from '@/lib/auth-client';
import { markSeen, promptDue, type SoftPrompt } from '@/lib/soft-prompts';

export default function SoftPromptBanner() {
  const [prompt, setPrompt] = useState<SoftPrompt | null>(null);
  const [wall, setWall] = useState<SoftPrompt | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await getSharedUser();
        if (!user) return;
        const r = await fetch('/api/prompts', { cache: 'no-store' });
        if (!r.ok) return;
        const body = (await r.json()) as { prompts?: SoftPrompt[] };
        if (cancelled) return;
        // The server sends them in priority order; the first one still due wins
        // (a dismissed prompt lets the next one through).
        const next = (body.prompts ?? []).find((p) => promptDue(p, user.id));
        if (next) {
          markSeen(user.id, next.key);
          setPrompt(next);
        }
      } catch { /* offline or blocked storage: nothing to say */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!prompt) return null;

  // Every prompt opens the existing paywall — the same opener the hard triggers
  // use — so the billing swap (Stripe → Apple IAP) never touches this file.
  function act() {
    if (prompt) setWall(prompt);
  }

  return (
    <>
      <div
        data-kb-hide=""
        className="shrink-0 border-t border-outline-variant/50 bg-surface-container-low px-container py-2.5"
      >
        <div className="flex items-center gap-3">
          <Icon name="workspace_premium" size={22} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-label-lg font-bold text-on-background">{prompt.title}</p>
            <p className="text-[13px] leading-snug text-on-surface-variant">{prompt.body}</p>
          </div>

          {/* Gold FILL with dark text (never white on gold), pill — the same
              strip action InstallBanner uses. */}
          <button
            type="button"
            onClick={act}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-button bg-primary-container px-4 text-label-lg font-semibold text-on-background transition active:scale-95"
          >
            {prompt.cta}
          </button>

          <button
            type="button"
            onClick={() => setPrompt(null)}
            aria-label="Dismiss"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-surface-variant transition active:scale-90"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>

      {wall && (
        <PaywallModal
          variant={wall.variant ?? 'invoice'}
          reason={wall.reason}
          returnTo="chat"
          onClose={() => setWall(null)}
        />
      )}
    </>
  );
}
