import test from 'node:test';
import assert from 'node:assert/strict';
import { openDestination } from './destination';

test('a declared in-app path opens through the router', () => {
  const pushed: string[] = [];
  const open = openDestination('/invoices?filter=unpaid', (p) => pushed.push(p));
  assert.ok(open);
  open!();
  assert.deepEqual(pushed, ['/invoices?filter=unpaid']);
});

test('no destination, or one that leaves the app, gives no handler', () => {
  for (const p of [undefined, '', 'invoices', '//evil.example', 'https://evil.example']) {
    assert.equal(openDestination(p, () => {}), undefined, String(p));
  }
});

// The server's real shape: askResponseBody puts destination beside the template.
import { readFileSync } from 'node:fs';
import { askResponseBody } from '@/lib/ask-response';
import { askQuestion } from '@/lib/ask-client';
import { unpaidTool } from '@/lib/tools/definitions/unpaid';

test('the unpaid answer\'s destination, as /api/ask sends it, opens Invoices · unpaid', async () => {
  const body = askResponseBody({
    reply: 'Two are unpaid.', messageId: '11111111-1111-4111-8111-111111111111',
    template: null, destination: unpaidTool.destination ?? null, fallback: 'x', tool: null, pending: null,
  });
  const out = await askQuestion('who owes me', (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch);
  assert.equal(out.kind, 'ok');
  const dest = out.kind === 'ok' ? out.destination : undefined;
  assert.deepEqual(dest, { screen: 'Invoices · unpaid', path: '/invoices?filter=unpaid' });
  const pushed: string[] = [];
  openDestination(dest?.path, (p) => pushed.push(p))!();
  assert.deepEqual(pushed, ['/invoices?filter=unpaid']);
});

test('a null destination (a tool with none) is dropped, not carried as null', async () => {
  const body = askResponseBody({ reply: 'r', messageId: null, template: null, destination: null, fallback: null, tool: null, pending: null });
  const out = await askQuestion('q', (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch);
  assert.equal(out.kind === 'ok' && 'destination' in out, false);
});

test('ChatView hands the declared destination to Show all, row taps and links', () => {
  const chat = readFileSync('src/components/tabs/ChatView.tsx', 'utf8').replace(/\r\n/g, '\n');
  assert.match(chat, /const open = openDestination\(m\.destination\?\.path, \(p\) => router\.push\(p\)\);/);
  assert.match(chat, /onRowTap: open, onShowAll: open, onOpen: open,/);
});
