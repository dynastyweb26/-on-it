'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, FileText, BarChart3, FolderLock, Settings } from 'lucide-react';

const TABS = [
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/dashboard', label: 'Cash Flow', icon: BarChart3 },
  { href: '/vault', label: 'Vault', icon: FolderLock },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="font-display text-xl font-extrabold">
          On It<span className="text-gold">.</span>
        </span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
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
