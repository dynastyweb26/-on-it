'use client';

import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { goBackOr } from '@/lib/back-nav';

interface BackButtonProps {
  parentHref: string;
  label?: string;
  className?: string;
}

export default function BackButton({ parentHref, label = 'Back', className = '' }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={label}
      // Back through history when there is one, so the screen the reader came
      // from — with its query string — is what reappears. Pushing parentHref
      // minted a second '/invoices' entry and dropped ?filter=, which reset the
      // list to Invoices and lost its scroll offset. A deep link still falls
      // back to the parent route.
      onClick={() =>
        goBackOr(
          () => router.push(parentHref),
          typeof window === 'undefined' ? 0 : window.history.length,
          () => router.back(),
        )
      }
      className={`inline-flex h-touch min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-on-surface-variant transition-transform active:scale-95 ${className}`}
    >
      <Icon name="arrow_back" size={24} />
    </button>
  );
}
