'use client';
// Slide 2 — Money in (RECAP-SPEC §5 "moneyIn"; the prototype's slides.js
// moneyIn): "You brought in" + the total counting up; one chip per payment
// method drops in, a glowing drop pours from each chip into its share of the
// segmented bar, each segment wipes in with its %; then the top-client card
// with its share bar.
//
// Payment marks (§0, lib/recap/paymarks.ts): Zelle, Cash App and card
// (Stripe) are their simple-icons marks in each brand's own hex (never
// recoloured); cash, check and other show a Material Symbol in a neutral chip,
// with a data colour for their bar segment so every segment is distinct.
//
// Reduce Motion: chips, segments, labels and the card fade; no drops; the
// total shows its final value (no count, no ticks).
import { useRef } from 'react';
import Icon from '@/components/Icon';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { money, per, plural } from '@/components/recap/copy';
import { fitContent, fitText } from '@/components/recap/fit';
import { METHOD_LABELS } from '@/lib/payment-methods';
import { payMark as markFor, segmentInk, type PayMark as PayMarkT } from '@/lib/recap/paymarks';

type Mark = PayMarkT;
const labelInk = (hex: string) => (segmentInk(hex) === 'ink' ? 'var(--onit-ink)' : 'var(--onit-cream)');

function PayMark({ mark }: { mark: Mark }) {
  if (mark.kind === 'brand') {
    return (
      <svg className="rc-paymark" role="img" aria-label={mark.icon.title} viewBox="0 0 24 24" width={26} height={26}>
        <path d={mark.icon.path} fill={mark.color} />
      </svg>
    );
  }
  return (
    <span className="rc-paymark rc-paymark-neutral" style={{ color: mark.color }} aria-hidden>
      <Icon name={mark.icon} size={18} />
    </span>
  );
}

export default function MoneyInSlide({ payload: d, timing, clock, reduced }: SlideProps) {
  const methods = d.paymentMethods.filter((m) => m.amount > 0);
  const tot = methods.reduce((a, m) => a + m.amount, 0) || 1;
  let acc = 0;
  const segs = methods.map((m) => { const s = { left: acc, share: (m.amount / tot) * 100 }; acc += s.share; return s; });
  const marks = methods.map((m) => markFor(m.method));
  const top = d.topClient;
  const topPct = top ? Math.round((top.amount / Math.max(1, d.income.total)) * 100) : 0;

  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dropRefs = useRef<(HTMLDivElement | null)[]>([]);

  useSlideAnims(clock, timing.B, reduced, (S) => {
    fitText(heroRef.current, money(d.income.total));
    fitContent(boxRef.current);
    // A segment too narrow for its % label shows none (no clipped digits).
    segRefs.current.forEach((seg) => {
      const label = seg?.firstElementChild as HTMLElement | null;
      if (seg && label) label.style.visibility = label.offsetWidth + 14 > seg.clientWidth ? 'hidden' : '';
    });
    // Drops: measured before anything is transformed, in the slide's own px.
    const root = rootRef.current?.getBoundingClientRect();
    const bar = barRef.current?.getBoundingClientRect();
    if (root && bar) {
      dropRefs.current.forEach((dr, i) => {
        const disc = chipRefs.current[i]?.querySelector('.rc-paymark')?.getBoundingClientRect();
        if (!dr || !disc) return;
        const x0 = disc.left - root.left + disc.width / 2, y0 = disc.top - root.top + disc.height / 2;
        const dx = bar.left - root.left + (bar.width * (segs[i].left + segs[i].share / 2)) / 100 - x0;
        const dy = bar.top - root.top + bar.height / 2 - y0;
        dr.style.left = `${x0 - 8}px`;
        dr.style.top = `${y0 - 8}px`;
        S.anim(dr, [
          { transform: 'translate(0,0) scale(.5)', opacity: 0 },
          { offset: 0.15, transform: 'translate(0,0) scale(1)', opacity: 1 },
          { offset: 0.55, transform: `translate(${(dx * 0.55).toFixed(1)}px,${(dy * 0.55 - 26).toFixed(1)}px) scale(1)`, opacity: 1 },
          { offset: 0.9, opacity: 1 },
          { transform: `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(.4)`, opacity: 0 },
        ], 'pour', { i, kind: 'fx' });
      });
    }
    S.fadeUp(labelRef.current, 'label');
    S.fadeUp(leadRef.current, 'lead');
    S.number(heroRef.current, d.income.total, 'count', money);
    chipRefs.current.forEach((c, i) => S.anim(c, [{ opacity: 0, transform: 'translateY(-60px)' }, { offset: 0.35, opacity: 1 }, { opacity: 1, transform: 'none' }], 'chips', { i }));
    segRefs.current.forEach((s, i) => {
      S.anim(s, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], 'segs', { i });
      S.anim(s?.firstElementChild ?? null, [{ opacity: 0 }, { opacity: 1 }], 'pct', { i });
    });
    S.fadeUp(capRef.current, 'caption');
    S.fadeUp(cardRef.current, 'card', { dy: 16 });
    S.grow(shareRef.current, 'share');
  });

  return (
    <div ref={rootRef} className="absolute inset-0">
      <div ref={boxRef} className="rc-content">
        <div ref={labelRef} className="rc-label">Money in</div>
        <div ref={leadRef} className="rc-lead">You brought in</div>
        <div ref={heroRef} className="rc-hero">{money(reduced ? d.income.total : 0)}</div>
        <div ref={capRef} className="rc-cap">
          {plural(d.income.payments, 'payment', 'payments')} · {plural(d.income.clients, 'client', 'clients')}
        </div>
        <div className="rc-paychips">
          {methods.map((m, i) => (
            <div key={m.method} ref={(el) => { chipRefs.current[i] = el; }} className="rc-paychip" style={{ ['--c' as string]: marks[i].color }}>
              <PayMark mark={marks[i]} />
              {METHOD_LABELS[m.method] ?? m.method}
              <b>{money(m.amount)}</b>
            </div>
          ))}
        </div>
        <div ref={barRef} className="rc-paybar" role="img" aria-label={methods.map((m, i) => `${METHOD_LABELS[m.method] ?? m.method} ${Math.round(segs[i].share)}%`).join(', ')}>
          {methods.map((m, i) => (
            <div
              key={m.method}
              ref={(el) => { segRefs.current[i] = el; }}
              className="rc-payseg"
              style={{ left: `${segs[i].left}%`, width: `${segs[i].share}%`, background: marks[i].color, borderRight: i === methods.length - 1 ? 0 : undefined }}
            >
              <span style={{ color: labelInk(marks[i].color) }}>{Math.round(segs[i].share)}%</span>
            </div>
          ))}
          <div className="rc-sheen" />
        </div>
        <div className="rc-spacer" />
        {top && (
          <div ref={cardRef} className="rc-card">
            <div className="rc-t17"><span className="rc-name">{top.name}</span><span className="rc-rest">was your top client.</span></div>
            <div className="rc-cap" style={{ marginTop: 3, fontSize: 14 }}>Paid {money(top.amount)}, {topPct}% of the {per(d)}.</div>
            <div className="rc-share"><i ref={shareRef} style={{ width: `${topPct}%` }} /></div>
          </div>
        )}
      </div>
      {methods.map((m, i) => (
        <div key={m.method} ref={(el) => { dropRefs.current[i] = el; }} className="rc-drop" style={{ ['--c' as string]: marks[i].color }} aria-hidden />
      ))}
    </div>
  );
}
