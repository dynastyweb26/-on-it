// ═══ Chat router · real-model accuracy run (NOT in CI) ═══
//
// Runs the labelled fixture through the same forced tool call the app uses and
// prints accuracy per route. Build precision comes first: a build labelled as
// ask/unsupported is the expensive error, so that column is the pass line.
//
//   ANTHROPIC_API_KEY=sk-... node --import ./scripts/test-register.mjs scripts/router-accuracy.ts
//
// Sends 30 short messages to Haiku-class. Costs a few cents.
import { ROUTER_PHRASES } from '../src/lib/router/__fixtures__/phrases';
import { anthropicRouteCall, classify, ROUTER_MODEL } from '../src/lib/router/classify';
import type { RouterRoute } from '../src/lib/router/decide';

const ROUTES: RouterRoute[] = ['ask', 'build', 'unsupported'];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is required to score the router against the real model.');
    process.exitCode = 2;
    return;
  }

  const call = anthropicRouteCall();
  const rows: Array<{ text: string; want: RouterRoute; got: RouterRoute | null }> = [];

  console.log(`router accuracy · ${ROUTER_MODEL} · ${ROUTER_PHRASES.length} phrases\n`);
  for (const phrase of ROUTER_PHRASES) {
    const got = await classify(phrase.text, call);
    rows.push({ text: phrase.text, want: phrase.route, got });
    const mark = got === phrase.route ? 'ok  ' : 'MISS';
    console.log(`${mark} want=${phrase.route.padEnd(11)} got=${String(got).padEnd(11)} ${phrase.text}`);
  }

  console.log('\nper-route');
  for (const route of ROUTES) {
    const of = rows.filter((r) => r.want === route);
    const right = of.filter((r) => r.got === route).length;
    const pct = of.length ? Math.round((right / of.length) * 100) : 100;
    console.log(`  ${route.padEnd(11)} recall ${right}/${of.length} (${pct}%)`);
  }

  const predictedBuild = rows.filter((r) => r.got === 'build');
  const trueBuild = predictedBuild.filter((r) => r.want === 'build').length;
  const precision = predictedBuild.length ? Math.round((trueBuild / predictedBuild.length) * 100) : 100;
  console.log(`\n  BUILD PRECISION ${trueBuild}/${predictedBuild.length} (${precision}%)  ← the pass line`);

  const missedBuilds = rows.filter((r) => r.want === 'build' && r.got !== 'build');
  if (missedBuilds.length) {
    console.log('\nbuild messages routed away (each one breaks an invoice flow):');
    for (const r of missedBuilds) console.log(`  - ${r.text}  → ${String(r.got)}`);
    process.exitCode = 1;
  }

  const wrongUnsupported = rows.filter((r) => r.got === 'unsupported' && r.want !== 'unsupported');
  if (wrongUnsupported.length) {
    console.log('\nwrongly refused (a question the app could answer, or a build):');
    for (const r of wrongUnsupported) console.log(`  - ${r.text}  want=${r.want}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
