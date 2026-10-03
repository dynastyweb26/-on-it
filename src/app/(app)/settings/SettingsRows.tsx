'use client';
// Grouped Settings rows (release frames 0c): an uppercase group label over a
// rounded card of 54 px rows — icon tile, title, a muted value, chevron. A row
// is a link (sub-screen or another tab) or a button (a sheet).
import Link from 'next/link';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';

export function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="px-1 pb-1 pt-2.5 text-xs font-bold uppercase tracking-[.07em] text-on-surface-variant">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest">{children}</div>
    </section>
  );
}

export function SettingsRow({ icon, title, value, href, onClick, tint = 'muted' }: {
  icon: IconName; title: string; value?: string | null;
  href?: string; onClick?: () => void;
  /** 'gold' = the soft-gold tile the frames give saved lists; 'muted' otherwise. */
  tint?: 'gold' | 'muted';
}) {
  const body = (
    <>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] ${tint === 'gold' ? 'bg-primary-soft' : 'bg-surface-container-high'}`}>
        <Icon name={icon} size={19} />
      </span>
      <span className="shrink-0 text-base font-medium text-on-background">{title}</span>
      <span className="min-w-0 flex-1 truncate text-right text-[15px] text-on-surface-variant">{value}</span>
      <Icon name="chevron_right" size={20} className="shrink-0 text-outline" />
    </>
  );
  const cls = 'flex h-[54px] w-full items-center gap-3 border-b border-outline-variant/40 px-3.5 text-left last:border-b-0 transition-colors active:bg-surface-container';
  return href
    ? <Link href={href} className={cls}>{body}</Link>
    : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

/** Big screen title ("Settings", "Business profile", …). */
export function SettingsTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="px-1 pb-1 font-display text-[30px] font-extrabold leading-tight text-on-background">{children}</h1>;
}
