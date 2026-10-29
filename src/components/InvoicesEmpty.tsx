'use client';
// The Invoices/Quotes empty state (NAV-SPEC Phase 1). Delegates to the shared
// EmptyState so every list screen uses one pattern; the CTA only opens Chat —
// it does not create a document, so it is never labelled "New invoice".
import { useRouter } from 'next/navigation';
import EmptyState from '@/components/EmptyState';
import type { IconName } from '@/components/icon-names';

export default function InvoicesEmpty({ icon, title, body }: {
  icon: IconName;
  title: string;
  body: string;
}) {
  const router = useRouter();
  return (
    <EmptyState
      icon={icon}
      title={title}
      message={body}
      action="Open Chat"
      actionIcon="chat_bubble"
      variant="outline"
      onAction={() => router.push('/chat')}
    />
  );
}
