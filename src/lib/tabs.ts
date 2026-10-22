import type { IconName } from '@/components/icon-names';

// Primary navigation, in visual order. Chat is the centre (raised) tab.
export const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/clients', label: 'Clients', icon: 'group' },
  { href: '/invoices', label: 'Invoices', icon: 'description' },
  { href: '/chat', label: 'Chat', icon: 'chat_bubble' },
  { href: '/dashboard', label: 'Books', icon: 'payments' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

/** The tab a path belongs to (nested routes resolve to their parent tab). */
export function tabIndexOf(pathname: string): number {
  return TABS.findIndex(({ href }) => pathname.startsWith(href));
}

/** The tab index only on the exact tab root; nested routes return -1. */
export function exactTabIndex(pathname: string): number {
  const i = tabIndexOf(pathname);
  return i >= 0 && TABS[i].href === pathname ? i : -1;
}
