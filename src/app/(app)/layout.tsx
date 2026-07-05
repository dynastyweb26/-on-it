'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Tutorial from '@/components/Tutorial';
import Icon from '@/components/Icon';

// 4 tabs. The Vault page still exists at /vault (archived PDFs surface on
// each invoice's detail page) but is no longer in primary navigation.
// Icons: Design Standard §4 canonical assignments.
const TABS = [
  { href: '/chat', label: 'Chat', icon: 'mic' },
  { href: '/invoices', label: 'Invoices', icon: 'description' },
  { href: '/dashboard', label: 'Cash Flow', icon: 'payments' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const SWIPE_THRESHOLD = 60; // px of horizontal travel to switch tabs

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  // Instagram-style horizontal swipe between tabs. Touch only; vertical
  // scrolling always wins once the gesture is more vertical than horizontal.
  const touch = useRef<{ x: number; y: number; vertical: boolean } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, vertical: false };
  }
  function onTouchMove(e: React.TouchEvent) {
    const s = touch.current;
    if (!s || s.vertical) return;
    const t = e.touches[0];
    if (Math.abs(t.clientY - s.y) > Math.abs(t.clientX - s.x) && Math.abs(t.clientY - s.y) > 10) {
      s.vertical = true; // scroll gesture — never hijack it
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touch.current;
    touch.current = null;
    if (!s || s.vertical) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    const current = TABS.findIndex(({ href }) => path.startsWith(href));
    if (current === -1) return;
    const next = current + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < TABS.length) router.push(TABS[next].href);
  }

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="font-display text-xl font-extrabold">
          On It<span className="text-primary-container">.</span>
        </span>
        <div className="flex items-center gap-1">
          {path.startsWith('/chat') && (
            <button
              aria-label="Recent conversations"
              className="grid h-touch w-touch place-items-center rounded-full text-on-surface-variant transition-transform active:scale-95"
              onClick={() => window.dispatchEvent(new Event('onit-history'))}
            >
              <Icon name="history" size={24} />
            </button>
          )}
          <button
            aria-label="How On It works"
            className="grid h-touch w-touch place-items-center rounded-full text-on-surface-variant transition-transform active:scale-95"
            onClick={() => setShowTutorial(true)}
          >
            <Icon name="help" size={24} />
          </button>
        </div>
      </header>
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
      <main
        className="min-h-0 flex-1 overflow-y-auto"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </main>
      <nav className="glass-nav flex justify-around border-t border-outline-variant/40 px-2 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ href, label, icon }) => {
          const active = path.startsWith(href);
          return (
            <Link key={href} href={href}
              className={`my-1.5 flex min-h-touch flex-col items-center justify-center gap-0.5 rounded-full px-4 text-[12px] font-semibold tracking-wide transition-all active:scale-90
                ${active ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}>
              <Icon name={icon} size={24} filled={active} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
