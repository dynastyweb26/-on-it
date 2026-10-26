import type { TutorialTab } from '@/lib/tutorial-seen';
import { HOME_SCREEN, TAB_OF_SCREEN, type Scene, type StepPatch, type TypingStep } from './data';

// Exact ports of the prototype's scheduling/counting/state helpers.

const SCHED = new Map<string, number[]>();

export function schedule(text: string, base = 0.1): number[] {
  const key = `${base}|${text}`;
  const cached = SCHED.get(key);
  if (cached) return cached;
  const k = base / 0.1;
  const out: number[] = [];
  let c = 0;
  for (const ch of text) {
    if (ch === '$') c += 0.25 * k;
    c += base;
    if (ch === ' ') c += 0.08 * k;
    out.push(c);
  }
  SCHED.set(key, out);
  return out;
}

export function typingDuration(text: string, base = 0.1): number {
  const a = schedule(text, base);
  return a.length ? a[a.length - 1] : 0;
}

export function typed(arr: TypingStep | undefined, t: number) {
  if (!arr) return { s: '', cur: false, done: false };
  const [text, start, base] = arr;
  const a = schedule(text, base);
  const e = t - start;
  let n = 0;
  while (n < a.length && a[n] <= e) n++;
  return {
    s: text.slice(0, n),
    cur: e < typingDuration(text, base) + 0.7,
    done: n >= text.length,
  };
}

const ANIM = new WeakMap<Scene, number>();

export function sceneDuration(sc: Scene): number {
  const cached = ANIM.get(sc);
  if (cached !== undefined) return cached;
  let e = 0;
  for (const [at, p] of sc.steps) {
    e = Math.max(e, at);
    if (p.tap) e = Math.max(e, at + 0.9);
    if (p.spot) e = Math.max(e, at + 0.7);
    if (p.sub) e = Math.max(e, at + 1.2);
    for (const k in p) {
      const v = (p as Record<string, unknown>)[k];
      if (!Array.isArray(v)) continue;
      if (typeof v[0] === 'string') e = Math.max(e, v[1] + typingDuration(v[0], v[2]) + 0.4);
      else if (k === 'sig') e = Math.max(e, v[0] + v[1]);
      else if (v.length === 3) e = Math.max(e, v[1] + v[2]);
    }
  }
  const d = Math.max(1.5, Math.round((e + 0.5) * 10) / 10);
  ANIM.set(sc, d);
  return d;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function count(arr: [number, number, number] | undefined, t: number, fallback: number): number {
  if (!arr) return fallback;
  const [to, start, dur] = arr;
  const p = clamp((t - start) / dur, 0, 1);
  return Math.round(to * (1 - Math.pow(1 - p, 3)));
}

export function money(v: number): string {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function split(v: number): [string, string] {
  const s = money(v);
  const i = s.lastIndexOf('.');
  return [s.slice(0, i), s.slice(i)];
}

export function applySteps(sc: Scene, t: number): StepPatch & { tapKey: string | null } {
  const st: StepPatch & { tapKey: string | null } = { tapKey: null };
  let tapAt = -9;
  let tapKey: string | null = null;
  for (const [at, patch] of sc.steps) {
    if (at <= t) {
      if (patch.tap) {
        tapAt = at;
        tapKey = patch.tap;
      }
      Object.assign(st, patch);
    }
  }
  st.tapKey = t - tapAt < 0.9 ? tapKey : null;
  return st;
}

export function deriveScene(tab: TutorialTab, sc: Scene, t: number) {
  const st = applySteps(sc, t);
  const screen = st.screen ?? HOME_SCREEN[tab];
  const tabNow = TAB_OF_SCREEN[screen];

  const comp = st.tcClear ? { s: '', cur: false, done: true } : typed(st.tc, t);
  const n = st.tcClear ? 999 : comp.s.length;
  const b = st.build;
  const built = b
    ? { card: n >= b.card, client: n >= b.client, price: n >= b.price, job: n >= b.job }
    : { card: false, client: false, price: false, job: false };

  const nameFilled = Boolean(st.nameF || built.client);
  const jobFilled = Boolean(st.jobF || built.job);
  const priceFilled = Boolean(st.priceF || built.price);
  const nT = typed(st.tName, t);
  const jT = typed(st.tJob, t);
  const pT = typed(st.tPrice, t);
  const total = count(st.cTotal, t, 0);
  const footFilled = nameFilled && jobFilled && priceFilled;
  const composerOn = screen === 'chat' && !st.noComposer;

  const seg = st.seg || 'inv';
  const eState = st.eState || 'sent';
  const sigP = st.sig ? clamp((t - st.sig[0]) / st.sig[1], 0, 1) : eState !== 'sent' ? 1 : 0;
  const sT = st.tSearchClear ? { s: '', cur: false, done: true } : typed(st.tSearch, t);
  const shN = typed(st.tSheetName, t);
  const shP = typed(st.tSheetPrice, t);
  const z = st.zero ? 0 : null;
  const [netI, netD] = split(count(st.cNet, t, z ?? 3560));
  const [owedI, owedD] = split(count(st.cOwed, t, z ?? 1200));
  const [collI, collD] = split(count(st.cColl, t, z ?? 4800));
  const [spentI, spentD] = split(count(st.cSpent, t, z ?? 1240));
  const ph = typed(st.tPhone, t);
  const em = typed(st.tEmail, t);
  const tm = typed(st.tTerms, t);
  const fr = st.style === 'friendly';

  return {
    st,
    screen,
    tabNow,
    comp,
    nameFilled,
    jobFilled,
    priceFilled,
    nT,
    jT,
    pT,
    total,
    footFilled,
    composerOn,
    seg,
    eState,
    sigP,
    sT,
    shN,
    shP,
    netI,
    netD,
    owedI,
    owedD,
    collI,
    collD,
    spentI,
    spentD,
    ph,
    em,
    tm,
    fr,
    spotKey: st.spot || null,
    tapKey: st.tapKey,
    totalStr: money(total),
    openTotal: money(count(st.cOpen, t, 1200)),
    amtDue: money(count(st.cDue, t, 400)),
    expAmt: '$' + count(st.cExp, t, 40),
    lineTotal: priceFilled ? '$400.00' : '$0.00',
    lineColor: priceFilled ? '#1E1A14' : '#B2A99A',
    sendBg: comp.s.length ? '#2F2A24' : '#EAE3D7',
    sendFg: comp.s.length ? '#FFF8EC' : '#A49B8D',
    estSubtitle:
      eState === 'sent'
        ? 'Estimate · Brandon · Sent Oct 24'
        : eState === 'approved'
          ? 'Estimate · Brandon · Approved Oct 24'
          : 'Estimate · Brandon · Converted',
    sigClip: `inset(-10px ${100 - sigP * 100}% -10px -10px)`,
    styleName: fr ? 'Friendly' : 'Classic',
    brandShift: st.brandScroll ? -150 : 0,
    clsBg: fr ? '#fff' : '#FAF0CF',
    clsBd: fr ? '#E6DCCB' : '#D4AF37',
    clsDot: fr ? 0 : 1,
    frBg: fr ? '#FAF0CF' : '#fff',
    frBd: fr ? '#D4AF37' : '#E6DCCB',
    frDot: fr ? 1 : 0,
    hlSub: st.sub || sc.sub,
    badge: st.badge || '',
    screenKey: `${screen}-${st.ps ? 'ps' : 'list'}-${seg}-${eState}-${st.ready ? 'ready' : 'home'}`,
  };
}

export type SceneState = ReturnType<typeof deriveScene>;
