'use client';
// /dev/ai-templates?fail=401|429|500: the thumbs wired to the real save client, with a
// fetch that answers that status, so the un-fill and the named cause can be seen.
import FeedbackThumbs from '@/components/chat/templates/FeedbackThumbs';
import { sendThumb } from '@/lib/ask-feedback-client';

export default function FailingThumbs({ status }: { status: number }) {
  const fakeFetch = (async () => new Response('{}', { status })) as unknown as typeof fetch;
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-4 xl:max-w-[720px] xl:px-0">
      <FeedbackThumbs
        state="idle"
        onVote={async (vote, reasons, note) => {
          const out = await sendThumb({ messageId: '11111111-1111-4111-8111-111111111111', thumb: vote, reasons: reasons ?? [], note: note || null }, fakeFetch);
          if (out.kind !== 'ok') throw new Error(out.message);
        }}
      />
    </main>
  );
}
