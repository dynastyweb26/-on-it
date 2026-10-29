'use client';
// The form side of drafts (#11): restore once on mount, save as the user types,
// clear on submit. Forms that must never persist anything (passwords, bank,
// payment) simply do not call this.
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { clearDraft, hasDraftContent, readDraft, saveDraft } from '@/lib/drafts';

/** Long enough not to write on every keystroke, short enough to survive a tab close. */
export const DRAFT_DEBOUNCE_MS = 400;

/**
 * Restores a draft into the form, keeps it current while typing, and stops on
 * `clear()` (submit) or sign-out (handled globally).
 *
 * `onRestore` is called at most once per mount and only when a draft exists, so
 * a form that was never left half-filled never sees a write.
 */
export function useFormDraft<T extends Record<string, unknown>>({ scope, value, onRestore }: {
  /** Form identity, e.g. `client:new` or `client:<id>`. */
  scope: string;
  value: T;
  onRestore: (saved: T) => void;
}): { clear: () => void; restored: boolean } {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  // After a submit nothing may be written again, even if the screen lingers.
  const cleared = useRef(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    let alive = true;
    (async () => {
      // getSession() is a local read (no network round trip).
      const { data: { session } } = await createClient().auth.getSession();
      if (!alive) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid && !cleared.current) {
        const saved = readDraft<T>(uid, scope);
        if (saved) {
          onRestoreRef.current(saved.v);
          setRestored(true);
        }
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [scope]);

  // Serialised so a parent re-render with the same values doesn't restart the
  // debounce forever.
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!ready || !userId || cleared.current) return;
    let parsed: T;
    try { parsed = JSON.parse(serialized) as T; } catch { return; }
    if (!hasDraftContent(parsed as Record<string, unknown>)) return;
    const t = setTimeout(() => { if (!cleared.current) saveDraft(userId, scope, parsed); }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [serialized, ready, userId, scope]);

  function clear(): void {
    cleared.current = true;
    if (userId) clearDraft(userId, scope);
    setRestored(false);
  }

  return { clear, restored };
}
