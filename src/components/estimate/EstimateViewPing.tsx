'use client';

// The estimate page's view beacon: once this estimate has been on screen for a
// few continuous seconds, tell the server. Mirrors the pay page's beacon, so a
// link-preview unfurl (which does not run JS) or a bounce is not a view.
//
// It renders nothing and never reports an error: a lost ping is a missing
// card, never a broken page.
import { useEffect, useRef } from 'react';

const VISIBLE_MS = 3000;

export default function EstimateViewPing({ token }: { token: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };

    const arm = () => {
      if (sent.current || timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (sent.current || document.visibilityState !== 'visible') return;
        sent.current = true;
        void fetch(`/api/e/${encodeURIComponent(token)}/viewed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
          keepalive: true,
        }).catch(() => { sent.current = false; });
      }, VISIBLE_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') arm();
      else clear();
    };

    arm();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token]);

  return null;
}
