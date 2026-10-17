// Client side of POST /api/feedback. The screen knows nothing about the route.
import type { FeedbackSource, FeedbackTag } from '@/lib/feedback';

export type SendResult = { ok: true } | { ok: false; message: string };

export async function sendFeedback(input: {
  tag: FeedbackTag;
  message: string;
  rating?: number;
  source: FeedbackSource;
  screen?: string;
}): Promise<SendResult> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...input,
        appVersion: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, message: data?.error ?? 'Couldn’t send that just now. Try again.' };
  } catch {
    return { ok: false, message: 'Couldn’t send that. Check your connection and try again.' };
  }
}
