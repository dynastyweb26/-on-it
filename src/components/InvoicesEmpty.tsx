'use client';
// The Invoices/Quotes empty state (NAV-SPEC Phase 1): icon + title + body +
// an outlined CTA. The CTA only opens Chat — it does not create a document, so
// it is never labelled "New invoice" / "New quote".
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';

export default function InvoicesEmpty({ icon, title, body }: {
  icon: IconName;
  title: string;
  body: string;
}) {
  const router = useRouter();
  return (
    <div data-coach="invoices-empty" className="onit-rise mx-auto mt-16 max-w-sm px-4 text-center">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary-soft text-on-background">
        <Icon name={icon} size={36} />
      </span>
      <h1 className="mt-5 font-display text-xl font-bold text-on-background">{title}</h1>
      <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">{body}</p>
      <button type="button" className="btn-outline mx-auto mt-6 px-7" onClick={() => router.push('/chat')}>
        <Icon name="chat_bubble" size={22} /> Open Chat
      </button>
    </div>
  );
}
