// Tap-to-reveal (PUNCH-LIST "Bank details: tap-to-reveal"): the pay page
// model carries the account masked to its last 4; the full number comes only
// from revealBankAccount (POST /api/pay/[token]/bank), behind the per-IP and
// per-token rate limits and the same gate as the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  publicBank, pageBank, bankGateFor, revealBankAccount,
  type PublicBankRow, type PublicInvoiceGateRow, type RevealDeps,
} from './pay-bank';

const FULL = '123456784417';
const TOKEN = 'TESTtokenAAAAAAAAAAAAA';
const bankRow: PublicBankRow = {
  holder_name: 'TEST Holder', bank_name: 'TEST Bank', routing: '021000021',
  account: FULL, account_type: 'checking',
};
const sent: PublicInvoiceGateRow = { kind: 'invoice', status: 'sent', total: '250.00', deposit_amount: '0', amount_paid: '0' };

/** Fake deps: an in-memory sliding count per bucket id, and fixed RPC rows. */
function deps(inv: PublicInvoiceGateRow | null, bank: PublicBankRow | null, caps = { ip: 20, token: 10 }) {
  const counts = new Map<string, number>();
  const calls: string[] = [];
  const d: RevealDeps = {
    limit: async (bucket, id) => {
      calls.push(`${bucket}:${id}`);
      const n = (counts.get(id) ?? 0) + 1;
      counts.set(id, n);
      return n <= caps[bucket];
    },
    invoice: async () => inv,
    bank: async () => bank,
  };
  return { d, calls };
}

test('masked in initial data: the page model has the last 4, never the full number', () => {
  const model = pageBank(publicBank(bankRow, bankGateFor(sent)));
  assert.deepEqual(model, {
    holderName: 'TEST Holder', bankName: 'TEST Bank', routing: '021000021',
    accountLast4: '4417', accountType: 'checking',
  });
  assert.ok(!JSON.stringify(model).includes(FULL));
  assert.ok(!('account' in model!));
  assert.equal(pageBank(null), null);
});

test('reveal works: payable invoice returns the full number', async () => {
  const { d, calls } = deps(sent, bankRow);
  const res = await revealBankAccount(TOKEN, '203.0.113.7', d);
  assert.deepEqual(res, { status: 200, body: { account: FULL } });
  assert.deepEqual(calls, ['ip:ip:203.0.113.7', `token:token:${TOKEN}`]);
  // Overdue and partly paid invoices still reveal.
  const partly = { ...sent, status: 'overdue', amount_paid: '100' };
  assert.equal((await revealBankAccount(TOKEN, '203.0.113.7', deps(partly, bankRow).d)).status, 200);
});

test('rate limit trips per token (many IPs) and per IP (many tokens)', async () => {
  const { d } = deps(sent, bankRow, { ip: 1000, token: 10 });
  for (let i = 0; i < 10; i++) assert.equal((await revealBankAccount(TOKEN, `198.51.100.${i}`, d)).status, 200);
  assert.deepEqual(await revealBankAccount(TOKEN, '198.51.100.99', d), { status: 429, body: { error: 'rate limited' } });

  const ip = deps(sent, bankRow, { ip: 20, token: 1000 });
  for (let i = 0; i < 20; i++) assert.equal((await revealBankAccount(`TESTtoken${i}`, '203.0.113.9', ip.d)).status, 200);
  assert.equal((await revealBankAccount('TESTtokenNEW', '203.0.113.9', ip.d)).status, 429);
});

test('a bad token shape is rate limited by IP and never reaches the token bucket or RPCs', async () => {
  let rpc = 0;
  const { d, calls } = deps(sent, bankRow);
  d.invoice = async () => { rpc++; return sent; };
  const res = await revealBankAccount('not a token!', '203.0.113.7', d);
  assert.equal(res.status, 404);
  assert.deepEqual(calls, ['ip:ip:203.0.113.7']);
  assert.equal(rpc, 0);
});

test('void invoice returns nothing (and so do paid, draft, quote, missing, disabled)', async () => {
  const notFound = { status: 404, body: { error: 'not found' } };
  // The SQL gate returns no bank row for these; the app gate must hold even if it did.
  const cases: [string, PublicInvoiceGateRow | null, PublicBankRow | null][] = [
    ['void', { ...sent, status: 'void' }, bankRow],
    ['void, sql gate', { ...sent, status: 'void' }, null],
    ['fully paid, status lagging', { ...sent, amount_paid: '250' }, bankRow],
    ['paid', { ...sent, status: 'paid', amount_paid: '250' }, bankRow],
    ['draft', { ...sent, status: 'draft' }, bankRow],
    ['quote', { ...sent, kind: 'quote' }, bankRow],
    ['no invoice (bad / deleted token)', null, bankRow],
    ['bank transfer off', sent, null],
  ];
  for (const [name, inv, bank] of cases) {
    assert.deepEqual(await revealBankAccount(TOKEN, '203.0.113.7', deps(inv, bank).d), notFound, name);
  }
});

test('RPC failure: 500, no account', async () => {
  const { d } = deps(sent, bankRow);
  d.bank = async () => { throw new Error('rpc down'); };
  assert.deepEqual(await revealBankAccount(TOKEN, '203.0.113.7', d), { status: 500, body: { error: 'unavailable' } });
});
