import type { SupabaseClient } from '@supabase/supabase-js';

/** The five tutorial tabs, in the app's visual order. */
export const TUTORIAL_TABS = ['clients', 'invoices', 'chat', 'books', 'settings'] as const;
export type TutorialTab = (typeof TUTORIAL_TABS)[number];

export type TutorialsSeen = Record<TutorialTab, boolean>;

const ALL_SEEN: TutorialsSeen = {
  clients: true,
  invoices: true,
  chat: true,
  books: true,
  settings: true,
};

export function emptyTutorialsSeen(): TutorialsSeen {
  return { clients: false, invoices: false, chat: false, books: false, settings: false };
}

/**
 * Parse the jsonb column. A malformed value (not a JSON object) is a failed
 * read: return null, so the caller must not autoplay. `{}` is valid and means
 * "nothing seen yet". Only a literal `true` counts; anything else is unseen.
 */
export function parseTutorialsSeen(value: unknown): TutorialsSeen | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    clients: row.clients === true,
    invoices: row.invoices === true,
    chat: row.chat === true,
    books: row.books === true,
    settings: row.settings === true,
  };
}

export function markTutorialSeen(seen: TutorialsSeen, tab: TutorialTab): TutorialsSeen {
  if (seen[tab]) return seen;
  return { ...seen, [tab]: true };
}

export function isTutorialTab(value: string): value is TutorialTab {
  return (TUTORIAL_TABS as readonly string[]).includes(value);
}

/** The full map is written on every change; jsonb UPDATE is column-granted. */
export async function readTutorialsSeen(
  supabase: SupabaseClient,
  userId: string,
): Promise<TutorialsSeen | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('tutorials_seen')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return parseTutorialsSeen((data as { tutorials_seen?: unknown }).tutorials_seen);
  } catch {
    return null;
  }
}

/** Best-effort write: a failure changes nothing this session. */
export async function writeTutorialsSeen(
  supabase: SupabaseClient,
  userId: string,
  seen: TutorialsSeen,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ tutorials_seen: seen })
      .eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * A tab autoplays only when the profile read succeeded and that tab has not
 * been seen. A failed read (null) never autoplays and never blocks the app.
 */
export function shouldAutoplay(seen: TutorialsSeen | null, tab: TutorialTab): boolean {
  return seen !== null && !seen[tab];
}

/** One-time existing-user backfill value, mirrored in the migration. */
export const TUTORIALS_SEEN_BACKFILL: TutorialsSeen = { ...ALL_SEEN };
