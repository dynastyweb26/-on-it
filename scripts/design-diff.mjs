#!/usr/bin/env node
/* ═══ design-diff: does the built UI match the design HTML? ═══
   Opens the design mockup (a local .html file) and the Vercel preview in the
   same headless browser at the same viewport, then compares, per case:

     1. LAYOUT      bounding boxes of paired elements (x, y, w, h within a px
                    tolerance), so "wrong format" fails.
     2. ANIMATIONS  every CSS animation / transition on paired elements: name,
                    duration, delay, iterations, easing, so "dropped or
                    simplified animation" fails.
     3. MOTION      samples transform/opacity at fixed times; an element that
                    moves in the design must move in the app (catches the
                    "looks right but static" failure).
     4. REDUCED     with --reduced, the app must have no running animation
                    longer than 1ms on the paired elements.
     5. PIXELS      whole-viewport pixel difference, reported (advisory unless
                    the case sets maxPixelDiffPct; real data differs from mock
                    data, so don't gate on it by default).

   No dependencies beyond Playwright (already in the sandbox). Exit code 1 on
   any FAIL, so it can gate a commit.

   Usage
     node scripts/design-diff.mjs --config design/laptop/diff.config.json \
          --preview https://on-xxxx-dynastyweb26s-projects.vercel.app \
          [--only clients,invoices] [--reduced] [--out .design-diff] \
          [--storage-state auth.json] [--bypass-token <vercel-bypass>]
     node scripts/design-diff.mjs --selftest

   Config (JSON)
     { "tolerancePx": 8,
       "cases": [{
         "name": "clients-1440",
         "viewport": { "width": 1440, "height": 900 },
         "design": { "file": "design/laptop/tutorial.html",
                     "steps": [ {"click": ".tour-start"}, {"wait": 800} ] },
         "app":    { "path": "/clients",
                     "steps": [ {"wait": 800} ] },
         "pairs": [
           { "name": "page header", "design": ".page-head", "app": "[data-coach=clients-list]",
             "check": ["x","y","w","h"], "tolerancePx": 12,
             "animations": true, "motionTimesMs": [0, 500, 1500] }
         ],
         "maxPixelDiffPct": null
       }] }
   Step kinds: {click:sel} {wait:ms} {eval:js} {hover:sel} {key:"ArrowRight"}.
   "check" defaults to x,y,w,h. Use ["w","h"] for elements whose position
   legitimately differs. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Playwright is not a project dependency (keeps installs small). Resolve it from
// the project, or the global/NODE_PATH install; otherwise say how to get it.
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright not found. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[k] = true;
      else { a[k] = next; i++; }
    } else a._.push(t);
  }
  return a;
}

const ANIM_SAMPLE = (sel, subtree) => {
  const el = document.querySelector(sel);
  if (!el) return { missing: true };
  return {
    animations: el.getAnimations({ subtree }).map((an) => {
      const t = an.effect && an.effect.getComputedTiming ? an.effect.getComputedTiming() : {};
      return {
        type: an.constructor.name,
        name: an.animationName || an.transitionProperty || '(script)',
        duration: Math.round(Number(t.duration) || 0),
        delay: Math.round(Number(t.delay) || 0),
        iterations: t.iterations === Infinity ? 'infinite' : t.iterations,
        easing: t.easing || '',
      };
    }),
  };
};

const RECT = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
};

const SNAP = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return `${cs.transform}|${cs.opacity}|${cs.filter}|${cs.clipPath}`;
};

async function runSteps(page, steps = []) {
  for (const s of steps) {
    if (s.click) await page.click(s.click, { timeout: 8000 });
    else if (s.hover) await page.hover(s.hover, { timeout: 8000 });
    else if (s.key) await page.keyboard.press(s.key);
    else if (s.eval) await page.evaluate(s.eval);
    else if (s.wait) await page.waitForTimeout(s.wait);
  }
}

async function sampleMotion(page, sel, times) {
  const out = [];
  let last = 0;
  for (const t of times) {
    if (t > last) await page.waitForTimeout(t - last);
    last = Math.max(last, t);
    out.push(await page.evaluate(SNAP, sel));
  }
  return out;
}

const keyOf = (a) => `${a.type}:${a.name}`;

function compareAnimations(d, a) {
  const issues = [];
  if (d.missing || a.missing) return [`element missing (design:${!d.missing} app:${!a.missing})`];
  const dm = new Map(), am = new Map();
  for (const x of d.animations) dm.set(keyOf(x), x);
  for (const x of a.animations) am.set(keyOf(x), x);
  for (const [k, x] of dm) {
    const y = am.get(k);
    if (!y) { issues.push(`missing animation ${k} (design duration ${x.duration}ms, ${x.iterations}x)`); continue; }
    if (Math.abs(x.duration - y.duration) > 20) issues.push(`${k} duration ${y.duration}ms, design ${x.duration}ms`);
    if (Math.abs(x.delay - y.delay) > 20) issues.push(`${k} delay ${y.delay}ms, design ${x.delay}ms`);
    if (String(x.iterations) !== String(y.iterations)) issues.push(`${k} iterations ${y.iterations}, design ${x.iterations}`);
    if (x.easing !== y.easing) issues.push(`${k} easing ${y.easing}, design ${x.easing}`);
  }
  for (const k of am.keys()) if (!dm.has(k)) issues.push(`extra animation not in design: ${k}`);
  return issues;
}

async function pixelDiffPct(browser, pngA, pngB) {
  const page = await browser.newPage();
  const toUrl = (b) => 'data:image/png;base64,' + b.toString('base64');
  const pct = await page.evaluate(async ([ua, ub]) => {
    const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const [ia, ib] = await Promise.all([load(ua), load(ub)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const px = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const A = px(ia), B = px(ib);
    let diff = 0;
    for (let i = 0; i < A.length; i += 4) {
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 48) diff++;
    }
    return (diff / (w * h)) * 100;
  }, [toUrl(pngA), toUrl(pngB)]);
  await page.close();
  return pct;
}

async function runCase(browser, cfg, c, opts) {
  const vp = c.viewport || { width: 1440, height: 900 };
  const mk = async (extra = {}) => browser.newContext({ viewport: vp, reducedMotion: 'no-preference', ...extra });
  const dctx = await mk();
  const actx = await mk({
    ...(opts.storageState ? { storageState: opts.storageState } : {}),
    ...(opts.bypass ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': opts.bypass, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
  });
  const dp = await dctx.newPage();
  const ap = await actx.newPage();
  const results = [];
  const push = (kind, name, ok, detail = '') => results.push({ kind, name, ok, detail });

  const designUrl = c.design.url || pathToFileURL(path.resolve(c.design.file)).href;
  const appUrl = c.app.url || new URL(c.app.path, opts.preview).href;
  await dp.goto(designUrl, { waitUntil: 'load' });
  await ap.goto(appUrl, { waitUntil: 'networkidle' }).catch(() => ap.goto(appUrl, { waitUntil: 'load' }));
  await runSteps(dp, c.design.steps);
  await runSteps(ap, c.app.steps);

  for (const p of c.pairs || []) {
    const tol = p.tolerancePx ?? cfg.tolerancePx ?? 8;
    const checks = p.check || ['x', 'y', 'w', 'h'];
    const [dr, ar] = await Promise.all([dp.evaluate(RECT, p.design), ap.evaluate(RECT, p.app)]);
    if (!dr || !ar) {
      push('layout', p.name, false, `element not found (design ${dr ? 'ok' : p.design}, app ${ar ? 'ok' : p.app})`);
      continue;
    }
    const bad = checks.filter((k) => Math.abs(dr[k] - ar[k]) > tol).map((k) => `${k}: app ${Math.round(ar[k])} vs design ${Math.round(dr[k])}`);
    push('layout', p.name, bad.length === 0, bad.join('; '));

    if (p.animations !== false) {
      const sub = p.subtree !== false;
      const [da, aa] = await Promise.all([dp.evaluate(ANIM_SAMPLE, [p.design, sub]), ap.evaluate(ANIM_SAMPLE, [p.app, sub])]);
      if (opts.reduced) {
        const running = (aa.animations || []).filter((x) => x.duration > 1);
        push('reduced-motion', p.name, running.length === 0, running.map((x) => `${x.name} ${x.duration}ms`).join('; '));
      } else {
        const issues = compareAnimations(da, aa);
        push('animation', p.name, issues.length === 0, issues.join('; '));
      }
    }
    if (p.motionTimesMs && !opts.reduced) {
      const [dm, am] = await Promise.all([sampleMotion(dp, p.design, p.motionTimesMs), sampleMotion(ap, p.app, p.motionTimesMs)]);
      const dMoves = new Set(dm).size > 1, aMoves = new Set(am).size > 1;
      push('motion', p.name, dMoves === aMoves, dMoves && !aMoves ? 'design moves, app is STATIC' : !dMoves && aMoves ? 'app moves, design does not' : '');
    }
  }

  const [sd, sa] = await Promise.all([dp.screenshot(), ap.screenshot()]);
  fs.mkdirSync(opts.out, { recursive: true });
  fs.writeFileSync(path.join(opts.out, `${c.name}.design.png`), sd);
  fs.writeFileSync(path.join(opts.out, `${c.name}.app.png`), sa);
  const pct = await pixelDiffPct(browser, sd, sa);
  const gate = c.maxPixelDiffPct;
  push('pixels', `${pct.toFixed(1)}% of pixels differ`, gate == null ? true : pct <= gate, gate == null ? 'advisory' : `limit ${gate}%`);

  await dctx.close();
  await actx.close();
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch();
  try {
    if (args.selftest) return await selftest(browser);
    if (!args.config || !args.preview) {
      console.error('usage: design-diff.mjs --config <json> --preview <url> [--only a,b] [--reduced] [--out dir]\n       design-diff.mjs --selftest');
      process.exit(2);
    }
    const cfg = JSON.parse(fs.readFileSync(args.config, 'utf8'));
    const only = args.only ? String(args.only).split(',') : null;
    const opts = {
      preview: String(args.preview), reduced: !!args.reduced, out: String(args.out || '.design-diff'),
      storageState: args['storage-state'], bypass: args['bypass-token'],
    };
    let failed = 0;
    for (const c of cfg.cases) {
      if (only && !only.includes(c.name)) continue;
      console.log(`\n== ${c.name} (${(c.viewport || {}).width || 1440}px) ==`);
      let res;
      try { res = await runCase(browser, cfg, c, opts); }
      catch (e) { res = [{ kind: 'error', name: c.name, ok: false, detail: String(e.message).split('\n')[0] }]; }
      for (const r of res) {
        console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.kind.padEnd(14)} ${r.name}${r.detail ? '  -> ' + r.detail : ''}`);
        if (!r.ok) failed++;
      }
    }
    console.log(`\n${failed ? 'FAILED' : 'OK'}: ${failed} failing check(s). Screenshots in ${opts.out}/`);
    process.exit(failed ? 1 : 0);
  } finally {
    await browser.close();
  }
}

/* Self-test: a design page, a faithful copy, and a broken copy (moved box,
   animation removed). The faithful copy must PASS; the broken must FAIL. */
async function selftest(browser) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-diff-'));
  const page = (box, anim) => `<!doctype html><meta charset=utf-8><style>
    body{margin:0;background:#fff8f0}
    @keyframes rise{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
    #card{position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:120px;background:#d4af37;
      ${anim ? 'animation:rise 1.6s cubic-bezier(.2,0,0,1) infinite alternate;' : ''}}
  </style><div id=card></div>`;
  const w = (n, h) => { const p = path.join(dir, n); fs.writeFileSync(p, h); return p; };
  const design = w('design.html', page({ x: 100, y: 80, w: 400 }, true));
  const good = w('good.html', page({ x: 102, y: 81, w: 400 }, true));
  const bad = w('bad.html', page({ x: 260, y: 80, w: 380 }, false));
  const cfgFor = (appFile) => ({
    cases: [{
      name: 'selftest', viewport: { width: 800, height: 400 },
      design: { file: design }, app: { url: pathToFileURL(appFile).href },
      pairs: [{ name: 'card', design: '#card', app: '#card', motionTimesMs: [0, 400, 800] }],
    }],
  });
  const opts = { preview: 'http://unused', reduced: false, out: path.join(dir, 'out') };
  const run = async (file) => (await runCase(browser, cfgFor(file), cfgFor(file).cases[0], opts)).filter((r) => r.kind !== 'pixels');
  const g = await run(good), b = await run(bad);
  const gOk = g.every((r) => r.ok), bBad = b.some((r) => !r.ok);
  console.log('faithful copy:', gOk ? 'PASS (expected)' : 'FAIL (UNEXPECTED)', g.filter((r) => !r.ok).map((r) => r.detail));
  console.log('broken copy  :', bBad ? 'FAIL (expected)' : 'PASS (UNEXPECTED)', b.filter((r) => !r.ok).map((r) => `${r.kind}: ${r.detail}`));
  process.exit(gOk && bBad ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
