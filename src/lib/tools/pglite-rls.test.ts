// ═══ Items 8-10 in real Postgres ═══
//
// Nothing here is mocked at the database boundary: the repo's migrations are
// executed as written, two owners exist inside PGlite, and every query runs as
// the authenticated role with auth.uid() set. That is what makes these claims
// facts rather than fixtures:
//
//   * every read tool sees only the caller's rows (item 10, looped over the
//     whole registry, so a new tool inherits the check)
//   * an empty database invents nothing
//   * a turn writes one chat_messages row naming every tool call (item 9)
//   * a log row attributed to another owner is refused by RLS (items 8 + 9)
//
// Item 8's migration guarantees (own-row select, feedback ownership, cascade on
// account deletion) live in ../chat-logging-migration.test.ts, which applies the
// same migration file. Both files run in CI with no database secret.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { OTHER, OWNER, openTestDb, type TestDb } from './pglite-test-db';
import { REGISTRY } from './registry';
import { logTurn, type ChatLogRow } from './log';
import { UNPAID_TOOL_NAME } from './definitions/unpaid';

const OWNER_INVOICE = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_INVOICE = 'bbbbbbbb-0000-4000-8000-000000000002';
const OTHER_CLIENT = 'Other Owner Ltd';

/** Tables the tools under test read, and the rows seeded for both owners. */
const SEEDED_TABLES = new Set(['invoices']);
const FOREIGN_MARKERS = [OTHER_INVOICE, OTHER_CLIENT];

let db: TestDb;

async function seedInvoices(): Promise<void> {
  await db.seed(
    `insert into public.invoices
       (id, user_id, kind, invoice_number, client_name, total, amount_paid, due_date, status, deleted_at)
     values
       ($1, $2, 'invoice', 7, 'Maria Santos', 120.00, 0, '2026-10-01', 'sent', null),
       ($3, $4, 'invoice', 9, $5, 999.00, 0, '2026-09-01', 'overdue', null)`,
    [OWNER_INVOICE, OWNER, OTHER_INVOICE, OTHER, OTHER_CLIENT],
  );
}

before(async () => {
  db = await openTestDb();
  await seedInvoices();
});

after(async () => {
  await db.close();
});

// ── Item 10: the shared loop, in real Postgres ─────────────────────────────
for (const tool of REGISTRY.list) {
  if (tool.type !== 'read' && tool.type !== 'nav' && tool.type !== 'meta') continue;

  test(`${tool.name}: real RLS keeps another owner's rows out of the result`, async () => {
    const scoped = db.toolDb(OWNER);
    const output = tool.output.parse(
      await tool.handler({ db: scoped, userId: OWNER }, tool.fixture.args as never),
    );

    const text = JSON.stringify(output);
    for (const marker of FOREIGN_MARKERS) {
      assert.equal(text.includes(marker), false, `foreign data leaked: ${marker}`);
    }

    // Not a vacuous pass: the tool did read, and every table it read is seeded
    // above. A tool over a new table must add that table here with its rows.
    assert.ok(scoped.tables.length > 0, 'the tool read at least one table');
    for (const table of scoped.tables) {
      assert.ok(SEEDED_TABLES.has(table), `seed rows for new table: ${table}`);
    }
  });
}

test('the authenticated role itself sees only its own invoice rows', async () => {
  const mine = await db.as(OWNER, (q) =>
    q.query<{ id: string }>('select id from public.invoices order by id'),
  );
  assert.deepEqual(mine.rows.map((row) => row.id), [OWNER_INVOICE]);

  const theirs = await db.as(OTHER, (q) =>
    q.query<{ id: string }>('select id from public.invoices order by id'),
  );
  assert.deepEqual(theirs.rows.map((row) => row.id), [OTHER_INVOICE]);
});

test('a row attributed to another owner is refused by the policy', async () => {
  await assert.rejects(
    db.as(OWNER, (q) =>
      q.query(
        `insert into public.invoices
           (id, user_id, kind, invoice_number, client_name, total, status)
         values ('cccccccc-0000-4000-8000-000000000003', $1, 'invoice', 99, 'Forged', 1.00, 'sent')`,
        [OTHER],
      ),
    ),
    /row-level security|violates/i,
  );
});

test('an empty database invents nothing', async () => {
  await db.seed('delete from public.invoices');
  try {
    const tool = REGISTRY.get(UNPAID_TOOL_NAME);
    const output = tool.output.parse(
      await tool.handler({ db: db.toolDb(OWNER), userId: OWNER }, {}),
    ) as { rows: unknown[]; totalCount: number; totalBalance: number; sentence: string };

    assert.deepEqual(output.rows, []);
    assert.equal(output.totalCount, 0);
    assert.equal(output.totalBalance, 0);
    assert.equal(output.sentence, 'Nothing is outstanding: every invoice you have sent is paid.');
  } finally {
    await seedInvoices();
  }
});

// ── Item 9: one log row per turn, every tool call named ────────────────────
const logRow = (over: Partial<ChatLogRow> = {}): ChatLogRow => ({
  userId: OWNER,
  sessionId: 'chat-1',
  turn: 1,
  toolsCalled: ['unpaid_invoices'],
  templateId: 'list.ranked',
  inputTokens: 120,
  outputTokens: 40,
  ...over,
});

test('a turn writes one row listing every tool call it made', async () => {
  const ok = await logTurn(
    db.chatLog(OWNER),
    logRow({ toolsCalled: ['unpaid_invoices', 'open_record'] }),
  );
  assert.equal(ok, true);

  const mine = await db.as(OWNER, (q) =>
    q.query<{ user_id: string; tools_called: string[]; template_id: string | null }>(
      'select user_id, tools_called, template_id from public.chat_messages',
    ),
  );
  assert.equal(mine.rows.length, 1);
  assert.equal(mine.rows[0].user_id, OWNER);
  assert.deepEqual(mine.rows[0].tools_called, ['unpaid_invoices', 'open_record']);
  assert.equal(mine.rows[0].template_id, 'list.ranked');

  // Another owner's session sees none of it.
  const theirs = await db.as(OTHER, (q) =>
    q.query('select id from public.chat_messages'),
  );
  assert.equal(theirs.rows.length, 0);
});

test('a log row attributed to another owner is refused, never thrown', async () => {
  const forged = await logTurn(db.chatLog(OWNER), logRow({ userId: OTHER, turn: 2 }));
  assert.equal(forged, false, 'logTurn reports the failure instead of breaking the turn');

  const theirs = await db.as(OTHER, (q) =>
    q.query<{ count: number }>('select count(*)::int as count from public.chat_messages'),
  );
  assert.equal(theirs.rows[0].count, 0, 'nothing was written under the other owner');
});
