'use client';
// /dev/ai-templates?request=200|401|429|500: cant.do wired to the real feature-request
// client, with a fetch that answers that status, so Requested-only-after-ok and the
// named cause can be seen.
import CantDo from '@/components/chat/templates/CantDo';
import { sendFeatureRequest } from '@/lib/ask-feature-request-client';
import { TEMPLATE_FIXTURES } from '@/lib/templates/fixtures';

export default function RequestDemo({ status }: { status: number }) {
  const fakeFetch = (async () => {
    await new Promise((r) => setTimeout(r, 400));
    return new Response('{}', { status });
  }) as unknown as typeof fetch;
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-4 xl:max-w-[720px] xl:px-0">
      <CantDo
        {...TEMPLATE_FIXTURES['cant.do']}
        onRequest={async () => {
          const out = await sendFeatureRequest('11111111-1111-4111-8111-111111111111', fakeFetch);
          if (out.kind !== 'ok') throw new Error(out.message);
        }}
      />
    </main>
  );
}
