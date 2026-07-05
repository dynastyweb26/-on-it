'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MessageCircle, FileText, BarChart3, Settings } from 'lucide-react';

// 4 tabs. The Vault page still exists at /vault (archived PDFs surface on
// each invoice's detail page) but is no longer in primary navigation.
const TABS = [
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/dashboard', label: 'Cash Flow', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const SWIPE_THRESHOLD = 60; // px of horizontal travel to switch tabs

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  // Instagram-style horizontal swipe between tabs. Touch only; vertical
  // scrolling always wins once the gesture is more vertical than horizontal.
  const touch = useRef<{ x: number; y: number; vertical: boolean } | null>(null);

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
          On It<span className="text-gold">.</span>
        </span>
      </header>
      <main
        className="min-h-0 flex-1 overflow-y-auto"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </main>
      <nav className="flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link key={href} href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium
                ${active ? 'text-gold' : 'text-ink/45'}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
