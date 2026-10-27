import type { ReactNode } from 'react';

// The one page-width wrapper for the app's tab screens: centered, capped on wide
// screens, 16px gutters on phones and 32px from md. Vertical padding and spacing
// stay with the screen (pass them in className), so a phone renders exactly as
// it did before this existed.
//   wide    max-w-6xl  dashboards and card grids (Books, Invoices)
//   default max-w-5xl  lists (Clients)
//   narrow  max-w-4xl  forms and settings
const SIZE = {
  wide: 'max-w-6xl',
  default: 'max-w-5xl',
  narrow: 'max-w-4xl',
} as const;

export default function PageContainer({ size = 'default', className = '', children }: {
  size?: keyof typeof SIZE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto w-full ${SIZE[size]} px-4 md:px-8 ${className}`.trim()}>
      {children}
    </div>
  );
}
