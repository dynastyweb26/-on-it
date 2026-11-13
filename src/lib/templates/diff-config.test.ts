// RULES.md §7: design-diff runs every template state at 390 and at 1280. The
// config is data, so this test reads it and checks coverage rather than trusting
// that it was typed completely.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEMPLATE_IDS } from '@/lib/tools/templates';
import { TEMPLATE_STATES } from './props';

const CONFIG = JSON.parse(
  readFileSync(new URL('../../../design/ai-templates/diff.config.json', import.meta.url), 'utf8'),
) as {
  tolerancePx: number;
  cases: {
    name: string;
    viewport: { width: number; height: number };
    design: { file: string; steps: unknown[] };
    app: { path: string; steps: unknown[] };
    pairs?: { name: string; design: string; app: string }[];
  }[];
};

// A Text-on-laptop variant is named <id>-<state>-laptop-1280. It adds coverage; it is not a state.
const BASE_CASES = CONFIG.cases.filter((c) => !/-laptop-1280$/.test(c.name));

test('every template state is listed at 390 and at 1280, exactly once', () => {
  const expected = new Set<string>();
  for (const id of TEMPLATE_IDS) {
    for (const state of TEMPLATE_STATES[id]) {
      for (const width of [390, 1280]) {
        expected.add(`${id}|${state}|${width}`);
      }
    }
  }

  const seen = new Set<string>();
  for (const c of BASE_CASES) {
    const match = /^([a-z.]+)-([a-zA-Z]+)-(390|1280)$/.exec(c.name);
    assert.ok(match, `case name is template-state-width: ${c.name}`);
    const [, id, state, width] = match;
    assert.equal(c.viewport.width, Number(width), `${c.name} viewport width`);
    assert.ok(c.app.path.includes(`template=${id}`), `${c.name} app template`);
    assert.ok(c.app.path.includes(`state=${state}`), `${c.name} app state`);
    assert.match(c.design.file, /^design\/ai-templates\/[A-Za-z]+\.dc\.html$/, c.name);
    seen.add(`${id}|${state}|${Number(width)}`);
  }

  assert.deepEqual([...seen].sort(), [...expected].sort());
  assert.equal(BASE_CASES.length, expected.size);
});

test('no case name is repeated', () => {
  const names = CONFIG.cases.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});

test('the app side is the non-production fixtures page, never a product route', () => {
  for (const c of CONFIG.cases) {
    assert.match(c.app.path, /^\/dev\/ai-templates\?/, c.name);
  }
});

test('every case pairs the design card with the app card at one width', () => {
  for (const c of CONFIG.cases) {
    assert.equal(c.pairs?.length, 1, c.name);
    assert.equal(c.pairs?.[0].design, '#dc-root .sc-host > div', c.name);
    assert.match(c.pairs?.[0].app ?? '', /^\[data-template="[a-z.]+"\]\[data-state="[a-zA-Z]+"\]$/, c.name);
  }
});

test('a laptop variant has a base case and asks the app for device=laptop at 1280', () => {
  for (const c of CONFIG.cases.filter((x) => /-laptop-1280$/.test(x.name))) {
    assert.equal(c.viewport.width, 1280, c.name);
    assert.ok(c.app.path.includes('device=laptop'), c.name);
    assert.ok(BASE_CASES.some((b) => b.name === c.name.replace('-laptop-1280', '-1280')), c.name);
  }
});
