// The affirmation type system: RecapPlayer.dc.html's affLayout(), ported as-is
// (RULES 13). Input is a quote with 1-2 key phrases in [brackets]. Key phrases
// are Montserrat 800 at K, the other words 600 at 0.72 K. Lines are chosen by
// a small DP: balanced widths, no one-word line, breaks preferred at punctuation
// and phrase edges, no split phrase, no line ending on a function word. K steps
// down 2 px at a time until the text fits a W x H box (330 x 400 in the app,
// 300 x 320 in the share image).
//
// Pure: text widths come from the injected `measure`, so tests run without a
// browser. The design measures with a canvas; the slide injects the same.

export type Measure = (text: string, weight: 600 | 800, sizePx: number) => number;

export type AffWord = { w: string; d: number };
export type AffSeg = {
  /** Key-phrase number (0 or 1), or -1 for plain words. */
  k: number;
  words: AffWord[];
  /** The brush goes under the first key phrase only. */
  under: boolean;
  /** Delay of the brush wipe (after the phrase's last word). Set on every seg, like the design. */
  ud: number;
};
export type AffLine = { segs: AffSeg[]; gap: number; lh: number; key: boolean; w: number };
export type AffLayout = {
  lines: AffLine[];
  K: number;
  P2: number;
  /** Delay of the diamond divider (after the last word). */
  divD: number;
  /** The words with the brackets removed. */
  plain: string;
  W: number;
  H: number;
};

type Tok = { t: string; k: number };

const R = 0.72;
const FN = new Set('a an the of and or to for in on at with by your my our is if'.split(' '));

export const AFF_BOX = {
  app: { W: 330, H: 400 },
  share: { W: 300, H: 320 },
} as const;

/** [brackets] → words, each tagged with its key phrase (the first two only). */
export function parseMarked(q: string): Tok[] {
  const words: Tok[] = [];
  let ki = -1, inK = false;
  q.replace(/\s+/g, ' ').trim().split(' ').forEach((tok) => {
    if (tok.includes('[')) { ki++; inK = true; }
    const t = tok.replace(/[\[\]]/g, '');
    if (t) words.push({ t, k: inK && ki < 2 ? ki : -1 });
    if (tok.includes(']')) inK = false;
  });
  return words;
}

export function affLayout(q: string, exportMode: boolean, measure: Measure): AffLayout {
  const words = parseMarked(q);
  const n = words.length;
  const mw = (t: string, key: boolean, z: number) => measure(t, key ? 800 : 600, z) + t.length * z * (key ? -0.02 : -0.01);
  const { W, H } = exportMode ? AFF_BOX.share : AFF_BOX.app;

  const brk = (i: number) => {
    const a = words[i], b = words[i + 1];
    let p = 0;
    if (a.k >= 0 && a.k === b.k) p += 18;
    if (/[,.;:?!—–]$/.test(a.t)) p -= 14; else if (a.k !== b.k) p -= 4; else p += 5;
    if (FN.has(a.t.toLowerCase())) p += 10;
    return p;
  };
  const midP = (i: number, j: number) => {
    let p = 0;
    for (let x = i; x < j - 1; x++) if (/[.;:?!]$/.test(words[x].t)) p += 40; else if (/,$/.test(words[x].t)) p += 6;
    return p;
  };

  type Cut = { i: number; j: number; w: number; gap: number; key: boolean; lh: number };
  const start = n <= 5 ? 60 : n <= 10 ? 52 : n <= 14 ? 44 : 40;
  let out: { K: number; P2: number; ls: Cut[]; s: number } | null = null;
  for (let K = start; K >= 22; K -= 2) {
    const P2 = Math.round(K * R);
    const ws = words.map((w) => mw(w.t, w.k >= 0, w.k >= 0 ? K : P2));
    const info = (i: number, j: number) => {
      let w = 0, key = false;
      for (let x = i; x < j; x++) { w += ws[x]; if (words[x].k >= 0) key = true; }
      const gap = key ? K * 0.24 : P2 * 0.3;
      return { w: w + gap * (j - i - 1), gap, key, lh: key ? Math.round(K * 1.08) : Math.round(P2 * 1.26) };
    };
    const tot = info(0, n).w;
    let best: { score: number; ls: Cut[] } | null = null;
    for (let k = 1; k <= 8; k++) {
      if (n > 1 && n < 2 * k) break;
      const T = tot / k;
      const f: number[][] = [], bp: number[][] = [];
      for (let c = 0; c <= k; c++) { f.push(new Array(n + 1).fill(Infinity)); bp.push(new Array(n + 1).fill(-1)); }
      f[0][0] = 0;
      for (let c = 1; c <= k; c++) for (let j = 1; j <= n; j++) for (let i = 0; i < j; i++) {
        if (f[c - 1][i] === Infinity || (n > 1 && j - i < 2)) continue;
        const L = info(i, j);
        if (L.w > W) continue;
        const v = f[c - 1][i] + 100 * Math.pow((L.w - T) / W, 2) + (j < n ? brk(j - 1) : 0) + midP(i, j);
        if (v < f[c][j]) { f[c][j] = v; bp[c][j] = i; }
      }
      if (f[k][n] === Infinity) continue;
      const cuts: [number, number][] = [];
      for (let c = k, j = n; c > 0; c--) { const i = bp[c][j]; cuts.unshift([i, j]); j = i; }
      const ls: Cut[] = cuts.map(([i, j]) => ({ i, j, ...info(i, j) }));
      if (ls.reduce((a, l) => a + l.lh, 0) > H && K > 22) continue;
      const score = f[k][n] + k;
      if (!best || score < best.score) best = { score, ls };
    }
    if (best) {
      const tot2 = best.score + 2.2 * (start - K);
      if (!out || tot2 < out.s) out = { K, P2, ls: best.ls, s: tot2 };
    }
  }
  if (!out) out = { K: 22, P2: 16, ls: [{ i: 0, j: n, w: 0, gap: 5, key: true, lh: 24 }], s: 0 };
  const { K, P2 } = out;

  let ud = 0;
  const lines: AffLine[] = out.ls.map((l) => {
    const segs: AffSeg[] = [];
    for (let x = l.i; x < l.j; x++) {
      const w = words[x], last = segs[segs.length - 1];
      const word = { w: w.t, d: 550 + x * 85 };
      if (last && last.k === w.k) { last.words.push(word); continue; }
      segs.push({ k: w.k, words: [word], under: w.k === 0, ud: 0 });
    }
    segs.forEach((g) => { if (g.under) ud = Math.max(ud, g.words[g.words.length - 1].d + 260); });
    return { segs, gap: l.gap, lh: l.lh, key: l.key, w: l.w };
  });
  lines.forEach((l) => l.segs.forEach((g) => { g.ud = ud; }));
  return { lines, K, P2, divD: 550 + n * 85 + 250, plain: words.map((w) => w.t).join(' '), W, H };
}
