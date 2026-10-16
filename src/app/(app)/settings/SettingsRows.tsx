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

// Right-side value colour: 'muted' (default) for counts and "Not set",
// 'default' for a real configured value, 'error' for something that needs action.
const VALUE_TONE = { muted: 'text-on-surface-variant', default: 'text-on-background', error: 'text-error' } as const;
export type SettingsValueTone = keyof typeof VALUE_TONE;

export function SettingsRow({ icon, tile, title, value, valueTone = 'muted', href, onClick, tint = 'muted', 'data-coach': dataCoach }: {
  icon?: IconName;
  /** Custom tile content (e.g. a brand mark) in place of the Material icon; same tile. */
  tile?: React.ReactNode;
  title: string; value?: string | null;
  valueTone?: SettingsValueTone;
  href?: string; onClick?: () => void;
  /** 'gold' = the soft-gold tile the frames give saved lists; 'muted' otherwise. */
  tint?: 'gold' | 'muted';
  'data-coach'?: string;
}) {
  const body = (
    <>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] ${tint === 'gold' ? 'bg-primary-soft' : 'bg-surface-container-high'}`}>
        {tile ?? (icon && <Icon name={icon} size={19} />)}
      </span>
      <span className="shrink-0 text-base font-medium text-on-background">{title}</span>
      <span className={`min-w-0 flex-1 truncate text-right text-[15px] ${VALUE_TONE[valueTone]}`}>{value}</span>
      <Icon name="chevron_right" size={20} className="shrink-0 text-outline" />
    </>
  );
  const cls = 'flex h-[54px] w-full items-center gap-3 border-b border-outline-variant/40 px-3.5 text-left last:border-b-0 transition-colors active:bg-surface-container';
  return href
    ? <Link href={href} data-coach={dataCoach} className={cls}>{body}</Link>
    : <button type="button" onClick={onClick} data-coach={dataCoach} className={cls}>{body}</button>;
}

/** Big screen title ("Settings", "Business profile", …). */
export function SettingsTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="px-1 pb-1 font-display text-[30px] font-extrabold leading-tight text-on-background">{children}</h1>;
}
