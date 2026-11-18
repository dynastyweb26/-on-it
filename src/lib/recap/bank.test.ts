import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bankFieldsFromJson, busiestBankName, recapBankFields,
  type RecapBankDepositRow, type RecapBankInput, type RecapBankTxnRow,
} from './bank';

const WEEK = { start: '2026-09-21', end: '2026-09-27' };

const deposit = (over: Partial<RecapBankDepositRow> = {}): RecapBankDepositRow => ({
  id: 'd1',
  item_id: 'item-a',
  name: 'DEPOSIT',
  merchant_name: null,
  occurred_on: '2026-09-22',
  removed_at: null,
  ...over,
});

const txn = (over: Partial<RecapBankTxnRow> = {}): RecapBankTxnRow => ({
  id: 't1',
  item_id: 'item-a',
  merchant: 'Shell',
  description: 'SHELL OIL',
  occurred_on: '2026-09-22',
  bank_state: 'posted',
  review_state: 'new',
  removed_at: null,
  ...over,
});

const ITEMS = [
  { id: 'item-a', institution_name: 'Chase' },
  { id: 'item-b', institution_name: 'Capital One' },
];

const base = (over: Partial<RecapBankInput> = {}): RecapBankInput => ({
  canBank: true,
  connected: true,
  period: WEEK,
  recordedIn: 0,
  recordedOut: 0,
  items: ITEMS,
  periodDeposits: [],
  periodTransactions: [],
  openDeposits: [],
  openTransactions: [],
  depositLinks: [],
  incomeDepositIds: [],
  ...over,
});

test('fields are absent for a plan without bank activity, or with no connected bank', () => {
  const input = base({ recordedIn: 3, recordedOut: 2, periodTransactions: [txn()] });
  assert.deepEqual(recapBankFields({ ...input, canBank: false }), {});
  assert.deepEqual(recapBankFields({ ...input, connected: false }), {});
});

test('activity_total is payments + expenses recorded in the period, every source', () => {
  const { bank } = recapBankFields(base({ recordedIn: 4, recordedOut: 6 }));
  assert.ok(bank);
  assert.equal(bank.total, 10);
  assert.equal(bank.auto, 0);
  assert.equal(bank.autoIn, 0);
  assert.equal(bank.autoOut, 0);
  // The design prints counts only: no money, no leftover fields.
  assert.deepEqual(Object.keys(bank).sort(),
    ['auto', 'autoIn', 'autoOut', 'items', 'more', 'name', 'pending', 'total']);
});

test('bank_auto_in: only deposits that became a payment or other income', () => {
  const { bank } = recapBankFields(base({
    recordedIn: 10,
    periodDeposits: [
      deposit({ id: 'd1' }),                                     // recorded → a payment
      deposit({ id: 'd2' }),                                     // linked → a payment the owner added: not the bank's
      deposit({ id: 'd3' }),                                     // other income
      deposit({ id: 'd4' }),                                     // ignored
      deposit({ id: 'd5' }),                                     // classified, not income
      deposit({ id: 'd6' }),                                     // still undecided
      deposit({ id: 'd7', removed_at: '2026-09-23T15:00:00Z' }), // pulled by the bank
      deposit({ id: 'd8', occurred_on: '2026-09-28' }),          // next week
    ],
    depositLinks: [
      { deposit_id: 'd1', kind: 'recorded' },
      { deposit_id: 'd2', kind: 'linked' },
      { deposit_id: 'd4', kind: 'ignored' },
      { deposit_id: 'd5', kind: 'classified' },
      { deposit_id: 'd7', kind: 'recorded' },
      { deposit_id: 'd8', kind: 'recorded' },
    ],
    incomeDepositIds: ['d3'],
  }));
  assert.ok(bank);
  assert.equal(bank.autoIn, 2);
  assert.equal(bank.auto, 2);

  // "Of these": a bank-sourced record never outnumbers the records.
  assert.equal(recapBankFields(base({
    recordedIn: 1,
    periodDeposits: [deposit({ id: 'd1' }), deposit({ id: 'd2' })],
    depositLinks: [{ deposit_id: 'd1', kind: 'recorded' }, { deposit_id: 'd2', kind: 'recorded' }],
  })).bank?.autoIn, 1);
});

test('bank_auto_out: only accounted charges → expenses; unreviewed rows do not count', () => {
  const { bank } = recapBankFields(base({
    recordedOut: 8,
    periodTransactions: [
      txn({ id: 't1', review_state: 'added' }),
      txn({ id: 't2', review_state: 'already' }),               // typed in by the owner: not the bank's
      txn({ id: 't3', review_state: 'new' }),
      txn({ id: 't4', review_state: 'needs_review' }),
      txn({ id: 't5', review_state: 'ignored' }),
      txn({ id: 't6', review_state: 'added', bank_state: 'removed', removed_at: '2026-09-23T15:00:00Z' }),
      txn({ id: 't7', review_state: 'added', occurred_on: '2026-09-20' }),
    ],
  }));
  assert.ok(bank);
  assert.equal(bank.autoOut, 1);

  assert.equal(recapBankFields(base({
    recordedOut: 1,
    periodTransactions: [
      txn({ id: 't1', review_state: 'added' }),
      txn({ id: 't2', review_state: 'added' }),
    ],
  })).bank?.autoOut, 1);
});

test('the bank named is the connected institution with the most activity', () => {
  assert.equal(busiestBankName(
    [{ id: 'a', institution_name: 'Chase' }, { id: 'b', institution_name: 'Amex' }],
    [deposit({ id: 'd1', item_id: 'b' }), deposit({ id: 'd2', item_id: 'b' })],
    [txn({ id: 't1', item_id: 'a' })],
  ), 'Amex');
  // A tie settles by name, so the same period always names the same bank.
  assert.equal(busiestBankName(
    [{ id: 'a', institution_name: 'Chase' }, { id: 'b', institution_name: 'Amex' }],
    [deposit({ id: 'd1', item_id: 'a' })],
    [txn({ id: 't1', item_id: 'b' })],
  ), 'Amex');
  // Only the period's rows count, and a nameless institution still reads.
  assert.equal(recapBankFields(base({
    items: [{ id: 'item-a', institution_name: null }],
    periodTransactions: [txn({ id: 't1', item_id: 'item-a' })],
  })).bank?.name, 'Bank account');
});

test('pending: open charges and undecided deposits, money in and out, newest first, three shown', () => {
  const { bank } = recapBankFields(base({
    openTransactions: [
      txn({ id: 'c1', merchant: 'Shell', occurred_on: '2026-09-25' }),
      txn({ id: 'c2', merchant: null, description: 'HOME DEPOT', occurred_on: '2026-09-24' }),
      txn({ id: 'c3', review_state: 'added', occurred_on: '2026-09-26' }),   // decided
      txn({ id: 'c4', bank_state: 'removed', removed_at: '2026-09-26T15:00:00Z' }),
      txn({ id: 'c5', merchant: 'Lowes', occurred_on: '2026-09-20' }),
    ],
    openDeposits: [
      deposit({ id: 'd1', name: null, merchant_name: 'STRIPE', occurred_on: '2026-09-26' }),
      deposit({ id: 'd2', occurred_on: '2026-09-23' }),                       // decided below
      deposit({ id: 'd3', occurred_on: '2026-09-22', removed_at: '2026-09-23T15:00:00Z' }),
    ],
    depositLinks: [{ deposit_id: 'd2', kind: 'ignored' }],
  }));
  assert.ok(bank);
  assert.equal(bank.pending, 4);
  // Newest first: the deposit, then the two charges, then the oldest charge.
  assert.deepEqual(bank.items, [
    { name: 'STRIPE', date: '2026-09-26' },
    { name: 'Shell', date: '2026-09-25' },
    { name: 'HOME DEPOT', date: '2026-09-24' },
  ]);
  assert.equal(bank.more, 1);
});

test('eligible with no activity: zeros, the bank, and nothing waiting', () => {
  const { bank } = recapBankFields(base());
  assert.deepEqual(bank, {
    // No activity enywhere: the tie settles on the name, alphabetically.
    total: 0, auto: 0, autoIn: 0, autoOut: 0, name: 'Capital One',
    pending: 0, items: [], more: 0,
  });
});

test('a route response is validated before it joins the payload', () => {
  const body = {
    bank: {
      total: 10, auto: 5, autoIn: 3, autoOut: 2, name: ' Chase ',
      pending: 5,
      items: [
        { name: 'Shell', date: '2026-09-25' },
        { name: 'STRIPE', date: '2026-09-26' },
        { name: 'Home Depot', date: '2026-09-24' },
        { name: 'Ignored, over the cap', date: '2026-09-23' },
      ],
      more: 99,                                                              // derived, never trusted
    },
    extra: 'ignored',
  };
  assert.deepEqual(bankFieldsFromJson(body), {
    bank: {
      total: 10, auto: 5, autoIn: 3, autoOut: 2, name: 'Chase',
      pending: 5,
      items: [
        { name: 'Shell', date: '2026-09-25' },
        { name: 'STRIPE', date: '2026-09-26' },
        { name: 'Home Depot', date: '2026-09-24' },
      ],
      more: 2,
    },
  });

  for (const bad of [null, undefined, 'x', 42, [], { bank: null }, { bank: 'x' }]) {
    assert.deepEqual(bankFieldsFromJson(bad), {});
  }
  const ok = { total: 1, auto: 0, autoIn: 0, autoOut: 0, name: 'Chase', pending: 0, items: [] };
  // A value that is not a count, a name that is not a name: the field is absent.
  for (const patch of [{ total: '1' }, { auto: -1 }, { autoIn: 1.5 }, { pending: Number.NaN }, { name: '  ' }]) {
    assert.deepEqual(bankFieldsFromJson({ bank: { ...ok, ...patch } }), {});
  }
  // The slide's invariants hold on arrival too.
  assert.deepEqual(bankFieldsFromJson({ bank: { ...ok, total: 0, auto: 1 } }), {});
  assert.deepEqual(bankFieldsFromJson({ bank: { ...ok, pending: 0, items: [{ name: 'Shell', date: '2026-09-25' }] } }), {});
  // A row without a name or a real date is dropped, not printed.
  assert.deepEqual(
    bankFieldsFromJson({ bank: { ...ok, pending: 2, items: [
      { name: 'Shell', date: '9/25' },
      { name: '', date: '2026-09-25' },
      { name: 'Lowes', date: '2026-09-20' },
    ] } }).bank?.items,
    [{ name: 'Lowes', date: '2026-09-20' }],
  );
});

test('the bank fields are composed through RLS only — no service role anywhere', () => {
  const loader = readFileSync('src/lib/recap/bank-server.ts', 'utf8');
  const route = readFileSync('src/app/api/recaps/bank/route.ts', 'utf8');
  assert.doesNotMatch(loader + route, /adminClient|service_role|SERVICE_ROLE|supabase\/admin/);
  // The one client is the viewer's own session client (cookie auth → RLS).
  assert.match(route, /from '@\/lib\/supabase\/server'/);
});

test('bank_last4: the busiest account under the busiest bank prints its last four digits', async () => {
  const { busiestBankLabel, last4 } = await import('./bank');
  const items = [{ id: 'a', institution_name: 'Chase' }];
  const accounts = [
    { id: 'acc1', item_id: 'a', mask: '0001' },
    { id: 'acc2', item_id: 'a', mask: '4821' },
  ];
  const dep = (id: string, account_id: string) => ({ id, item_id: 'a', account_id, name: null, merchant_name: null, occurred_on: '2026-09-23' });
  assert.equal(busiestBankLabel(items, accounts, [dep('d1', 'acc2'), dep('d2', 'acc2'), dep('d3', 'acc1')], []), 'Chase ···· 4821');
  // No digits on file: the institution alone, never a blank mask.
  assert.equal(busiestBankLabel(items, [{ id: 'acc1', item_id: 'a', mask: null }], [dep('d1', 'acc1')], []), 'Chase');
  assert.equal(busiestBankLabel(items, [], [], []), 'Chase');
  assert.equal(last4('xxxx4821'), '4821');
  assert.equal(last4(''), null);
});
