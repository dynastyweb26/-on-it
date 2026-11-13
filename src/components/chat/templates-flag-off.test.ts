// With NEXT_PUBLIC_AI_TOOLS off the chat must behave exactly as on main. ChatView
// needs Supabase to mount, so this proves it at the three places the template work
// touches: the route decision, the ask client, and the markup the flag gates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideRoute, type RouterRoute } from '@/lib/router/decide';
import { askQuestion } from '@/lib/ask-client';

const chat = readFileSync('src/components/tabs/ChatView.tsx', 'utf8').replace(/\r\n/g, '\n');

test('flag off: no question is ever routed to /api/ask, whatever the router said', () => {
  const texts = ['who owes me', 'show me Ruth Lawrence invoice', 'what did I quote Joyn', 'how much is unpaid', 'nobody here', 'invoice Chenyi $500'];
  for (const text of texts) {
    for (const classified of ['ask', 'build', 'unsupported', null] as (RouterRoute | null)[]) {
      const d = decideRoute({ flagOn: false, bypass: null, classified, text });
      assert.equal(d.route, 'build', `${text} / ${classified}`);
    }
  }
});

test('flag off: a main-shaped /api/ask answer comes back with nothing extra', async () => {
  const fetchMain = (async () => new Response(JSON.stringify({ reply: 'Two are unpaid.' }), { status: 200 })) as unknown as typeof fetch;
  assert.deepEqual(await askQuestion('who owes me', fetchMain), { kind: 'ok', reply: 'Two are unpaid.' });
});

test('a template message exists only where the /api/ask answer is handled', () => {
  const sends = [...chat.matchAll(/template: card/g)];
  assert.equal(sends.length, 1, 'exactly one place creates a template message');
  const ask = chat.indexOf("decision.route === 'ask'");
  const at = chat.indexOf('template: card');
  const end = chat.indexOf('A failure names its cause', ask);
  assert.ok(ask > 0 && at > ask && end > at, 'inside the ask branch');
});

test('the template branch needs a stored template, which flag-off messages never have', () => {
  assert.match(chat, /\) : m\.template && resolveTemplate\(m\.template\) \? \(\s*<TemplateReply/);
});

test('flag off: the laptop column and list classes are main\'s, byte for byte', () => {
  assert.ok(chat.includes("${AI_TOOLS ? 'xl:max-w-[768px] xl:px-6' : 'xl:max-w-[720px]'}"));
  assert.ok(chat.includes("px-4 py-4 md:px-6${AI_TOOLS ? ' xl:space-y-[14px] xl:px-0 xl:py-5' : ''}"));
  // The old strings, unchanged, are what the flag-off side resolves to.
  assert.ok(chat.includes('mx-auto flex h-full w-full max-w-4xl flex-col '));
  assert.ok(chat.includes('min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-4 md:px-6'));
});
