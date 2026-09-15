'use client';

import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';

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
      onClick={() => router.push(parentHref)}
      className={`inline-flex h-touch min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-on-surface-variant transition-transform active:scale-95 ${className}`}
    >
      <Icon name="arrow_back" size={24} />
    </button>
  );
}
