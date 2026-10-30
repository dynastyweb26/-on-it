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
      <h2 className="px-1 pb-1 pt-2.5 text-xs font-bold uppercase tracking-[.07em] text-on-surface-variant xl:pb-2 xl:pl-1 xl:pt-[18px] xl:text-[12px] xl:tracking-[.12em]">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest xl:rounded-[18px]">{children}</div>
    </section>
  );
}

// Right-side value colour: 'muted' (default) for counts and "Not set",
// 'default' for a real configured value, 'error' for something that needs action.
const VALUE_TONE = { muted: 'text-on-surface-variant', default: 'text-on-background', error: 'text-error' } as const;
export type SettingsValueTone = keyof typeof VALUE_TONE;

export function SettingsRow({ icon, tile, title, value, valueTone = 'muted', locked = false, href, onClick, onNavigate, active = false, tint = 'muted', 'data-coach': dataCoach, 'data-payouts-set': payoutsSet }: {
  icon?: IconName;
  /** Custom tile content (e.g. a brand mark) in place of the Material icon; same tile. */
  tile?: React.ReactNode;
  title: string; value?: string | null;
  valueTone?: SettingsValueTone;
  /** Pro-only row: a gold lock sits before the value (Bank accounts, free). */
  locked?: boolean;
  href?: string; onClick?: () => void;
  /**
   * Link rows only: the laptop split's click handler. It selects the row in the
   * right pane and routes; below xl SettingsView never passes one, so the link
   * navigates exactly as it did.
   */
  onNavigate?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  /** Laptop split only: this section is the one in the right pane (design rowBizBg #f3e9c8). */
  active?: boolean;
  /** 'gold' = the soft-gold tile the frames give saved lists; 'muted' otherwise. */
  tint?: 'gold' | 'muted';
  'data-coach'?: string;
  /** Payouts row only: "yes" / "no" once known (read by the walkthrough). */
  'data-payouts-set'?: string;
}) {
  const body = (
    <>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] ${tint === 'gold' ? 'bg-primary-soft' : 'bg-surface-container-high'}`}>
        {tile ?? (icon && <Icon name={icon} size={19} />)}
      </span>
      <span className="shrink-0 text-base font-medium text-on-background">{title}</span>
      {locked && <Icon name="lock" size={17} className="shrink-0 text-primary" />}
      <span className={`min-w-0 flex-1 truncate text-right text-[15px] ${VALUE_TONE[valueTone]}`}>{value}</span>
      <Icon name="chevron_right" size={20} className="shrink-0 text-outline" />
    </>
  );
  // The selected fill is added only when a row is actually selected, which the
  // split only ever does at xl: below 1280 the rendered DOM is untouched.
  const cls = 'flex h-[54px] w-full items-center gap-3 border-b border-outline-variant/40 px-3.5 text-left last:border-b-0 transition-colors active:bg-surface-container xl:h-12 xl:hover:bg-surface-container-low'
    + (active ? ' xl:bg-sent-container' : '');
  return href
    ? <Link href={href} data-coach={dataCoach} data-payouts-set={payoutsSet} onClick={onNavigate}
        aria-current={active ? 'true' : undefined} className={cls}>{body}</Link>
    : <button type="button" onClick={onClick} data-coach={dataCoach} data-payouts-set={payoutsSet} className={cls}>{body}</button>;
}

/** Big screen title ("Settings", "Business profile", …). */
export function SettingsTitle({ children }: { children: React.ReactNode }) {
  // Matches PageHeader's laptop row: 24px title on a 40px line.
  return <h1 className="px-1 pb-1 font-display text-[30px] font-extrabold leading-tight text-on-background xl:px-1 xl:h-10 xl:pb-0 xl:text-2xl xl:font-bold xl:leading-none">{children}</h1>;
}
