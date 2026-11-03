import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  matchClient,
  clientQuestionPending,
  matchOrCreateClient,
  namesRelated,
  type ClientRecord,
} from './clients';

let seq = 0;
function rec(name: string, extra: Partial<ClientRecord> = {}): ClientRecord {
  seq += 1;
  return {
    id: `c-${seq}`, name, email: null, phone: null, address: null,
    saved_at: null, deleted_at: null, ...extra,
  };
}

// ── matchClient (pure) ───────────────────────────────────────────

test('exact name match', () => {
  const maria = rec('Maria Gonzalez');
  const out = matchClient({ name: 'Maria Gonzalez' }, [maria, rec('Bob')]);
  assert.deepEqual(out, { status: 'matched', client: maria, via: 'name' });
});

test('case and outer-space differences still match exactly', () => {
  const cyril = rec('Cyril');
  for (const typed of ['cyril', 'CYRIL', '  Cyril  ', 'cYrIl']) {
    const out = matchClient({ name: typed }, [cyril]);
    assert.equal(out.status, 'matched', typed);
    assert.equal(out.status === 'matched' && out.client.id, cyril.id);
  }
});

test('exact beats ambiguous: "Maria" matches Maria even with Maria Gonzalez present', () => {
  const maria = rec('Maria');
  const out = matchClient({ name: 'Maria' }, [rec('Maria Gonzalez'), maria, rec('Maria Lopez')]);
  assert.deepEqual(out, { status: 'matched', client: maria, via: 'name' });
});

test('first name only is ambiguous and lists every close client', () => {
  const g = rec('Maria Gonzalez');
  const l = rec('Maria Lopez');
  const out = matchClient({ name: 'Maria' }, [g, l, rec('Bob')]);
  assert.equal(out.status, 'ambiguous');
  assert.deepEqual(out.status === 'ambiguous' && out.candidates.map((c) => c.id).sort(), [g.id, l.id].sort());
});

test('a name that is a prefix of an existing one is ambiguous (word and partial word)', () => {
  const g = rec('Maria Gonzalez');
  assert.equal(matchClient({ name: 'Maria G' }, [g]).status, 'ambiguous');
  assert.equal(matchClient({ name: 'Acme' }, [rec('Acme Roofing')]).status, 'ambiguous');
  // and the other direction: the typed name is longer than the stored one
  assert.equal(matchClient({ name: 'Maria Gonzalez' }, [rec('Maria')]).status, 'ambiguous');
});

test('different surnames are not related: no match', () => {
  const out = matchClient({ name: 'Maria Gonzalez' }, [rec('Maria Lopez')]);
  assert.deepEqual(out, { status: 'none' });
});

test('no match', () => {
  assert.deepEqual(matchClient({ name: 'Zed Plumbing' }, [rec('Maria'), rec('Bob')]), { status: 'none' });
  assert.deepEqual(matchClient({ name: 'Zed Plumbing' }, []), { status: 'none' });
});

test('email match with a compatible name is matched (case-insensitive)', () => {
  const c = rec('Maria Gonzalez', { email: 'Maria@Example.com' });
  const out = matchClient({ name: 'Maria G', email: ' maria@example.COM ' }, [c]);
  assert.deepEqual(out, { status: 'matched', client: c, via: 'email' });
});

test('shared phone with a compatible name is matched', () => {
  const c = rec('Maria Gonzalez', { phone: '(555) 010-0199' });
  const out = matchClient({ name: 'Maria', phone: '555-010-0199' }, [c]);
  assert.deepEqual(out, { status: 'matched', client: c, via: 'phone' });
});

test('shared phone with a different name is ambiguous, never a silent merge', () => {
  const maria = rec('Maria Gonzalez', { phone: '555-010-0199' });
  const out = matchClient({ name: 'Jose Gonzalez', phone: '5550100199' }, [maria]);
  assert.deepEqual(out, { status: 'ambiguous', candidates: [maria] });
});

test('shared email with a different name is ambiguous', () => {
  const c = rec('Acme Roofing', { email: 'office@acme.com' });
  const out = matchClient({ name: 'Bob Smith', email: 'office@acme.com' }, [c]);
  assert.equal(out.status, 'ambiguous');
});

test('a short phone is not trusted as a key', () => {
  const c = rec('Maria Gonzalez', { phone: '0199' });
  assert.deepEqual(matchClient({ name: 'Jose', phone: '0199' }, [c]), { status: 'none' });
});

test('soft-deleted exact match is returned as-is', () => {
  const gone = rec('Maria', { deleted_at: '2026-10-01T00:00:00.000Z', saved_at: null });
  const out = matchClient({ name: 'maria' }, [gone]);
  assert.deepEqual(out, { status: 'matched', client: gone, via: 'name' });
});

test('soft-deleted clients are never offered as a "did you mean"', () => {
  const gone = rec('Maria Gonzalez', { deleted_at: '2026-10-01T00:00:00.000Z', phone: '555-010-0199' });
  assert.deepEqual(matchClient({ name: 'Maria', phone: '555-010-0199' }, [gone]), { status: 'none' });
});

test('empty or blank name is invalid', () => {
  assert.deepEqual(matchClient({ name: '' }, [rec('Maria')]), { status: 'invalid', reason: 'empty' });
  assert.deepEqual(matchClient({ name: '   ' }, [rec('Maria')]), { status: 'invalid', reason: 'empty' });
  assert.deepEqual(matchClient({ name: ' . ' }, [rec('Maria')]), { status: 'invalid', reason: 'empty' });
});

test('a name over the 120-character column limit is invalid', () => {
  assert.deepEqual(matchClient({ name: 'x'.repeat(121) }, []), { status: 'invalid', reason: 'too_long' });
});

test('namesRelated', () => {
  assert.equal(namesRelated('Maria', 'Maria Gonzalez'), true);
  assert.equal(namesRelated('Maria G.', 'Maria Gonzalez'), true);
  assert.equal(namesRelated('Maria Gonzalez', 'Maria Lopez'), false);
  assert.equal(namesRelated('Smith', 'John Smith'), false);
  assert.equal(namesRelated('', 'Maria'), false);
});

// ── matchOrCreateClient (fake user-scoped client) ────────────────

interface FakeQuery {
  select: () => FakeQuery;
  eq: () => FakeQuery;
  like: () => FakeQuery;
  ilike: () => FakeQuery;
  limit: () => FakeQuery;
  insert: (r: Record<string, unknown>) => FakeQuery;
  update: (p: Record<string, unknown>) => FakeQuery;
  single: () => Promise<{ data: Record<string, unknown>; error: null }>;
  maybeSingle: () => Promise<{ data: ClientRecord | null; error: null }>;
  then: (res: (v: { data: ClientRecord[] | null; error: null }) => unknown) => Promise<unknown>;
}

function fake(rows: ClientRecord[]) {
  const calls = {
    from: 0,
    inserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  };
  const make = (): FakeQuery => {
    let mode: 'select' | 'insert' | 'update' = 'select';
    let row: Record<string, unknown> = {};
    const self: FakeQuery = {
      select: () => self,
      eq: () => self,
      like: () => self,
      ilike: () => self,
      limit: () => self,
      insert: (r) => { calls.inserts.push(r); mode = 'insert'; row = r; return self; },
      update: (p) => { calls.updates.push(p); mode = 'update'; return self; },
      single: () => Promise.resolve({
        data: { id: 'new-1', email: null, phone: null, address: null, saved_at: null, deleted_at: null, ...row },
        error: null,
      }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res) => Promise.resolve({ data: mode === 'select' ? rows : null, error: null }).then(res),
    };
    return self;
  };
  const supabase = {
    from: () => { calls.from += 1; return make(); },
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.rpcs.push({ fn, args });
      return Promise.resolve({ data: [{ id: 'saved-1', linked: 2 }], error: null });
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

test('service: ambiguous creates nothing', async () => {
  const { supabase, calls } = fake([rec('Maria Gonzalez')]);
  const out = await matchOrCreateClient(supabase, 'u1', { name: 'Maria' });
  assert.equal(out.status, 'ambiguous');
  assert.equal(calls.inserts.length, 0);
  assert.equal(calls.rpcs.length, 0);
});

test('service: createIfAmbiguous creates the typed client, unsaved', async () => {
  const { supabase, calls } = fake([rec('Maria Gonzalez')]);
  const out = await matchOrCreateClient(supabase, 'u1', { name: 'Maria', phone: '555' }, { createIfAmbiguous: true });
  assert.equal(out.status, 'created');
  assert.deepEqual(calls.inserts, [{ user_id: 'u1', name: 'Maria', phone: '555' }]);
});

test('service: no match creates an unsaved client for this user', async () => {
  const { supabase, calls } = fake([rec('Bob')]);
  const out = await matchOrCreateClient(supabase, 'u1', { name: '  Zed Plumbing ', address: '1 Main' });
  assert.equal(out.status, 'created');
  assert.deepEqual(calls.inserts, [{ user_id: 'u1', name: 'Zed Plumbing', address: '1 Main' }]);
  assert.equal(calls.inserts[0].saved_at, undefined);
});

test('service: exact match refreshes address/phone and never inserts', async () => {
  const cyril = rec('Cyril');
  const { supabase, calls } = fake([cyril]);
  const out = await matchOrCreateClient(supabase, 'u1', { name: 'cyril', address: '9 Oak', phone: ' ' });
  assert.equal(out.status, 'matched');
  assert.equal(out.status === 'matched' && out.client.id, cyril.id);
  assert.equal(calls.inserts.length, 0);
  assert.deepEqual(calls.updates, [{ address: '9 Oak' }]); // blank phone never wipes
});

test('service: empty name is invalid and never touches the database', async () => {
  const { supabase, calls } = fake([rec('Maria')]);
  const out = await matchOrCreateClient(supabase, 'u1', { name: '   ' });
  assert.deepEqual(out, { status: 'invalid', reason: 'empty' });
  assert.equal(calls.from, 0);
});

test('service: save mode calls the RPC with the stored spelling', async () => {
  const { supabase, calls } = fake([rec('Cyril')]);
  const out = await matchOrCreateClient(supabase, 'u1', { name: 'cyril' }, { save: true });
  assert.equal(out.status, 'matched');
  assert.equal(calls.rpcs[0].fn, 'save_client');
  assert.equal(calls.rpcs[0].args.p_name, 'Cyril');
  assert.equal(calls.inserts.length, 0);
});

test('service: save mode ambiguity does not call the RPC', async () => {
  const { supabase, calls } = fake([rec('Maria Gonzalez')]);
  const out = await matchOrCreateClient(supabase, 'u1', { name: 'Maria' }, { save: true });
  assert.equal(out.status, 'ambiguous');
  assert.equal(calls.rpcs.length, 0);
});

// ── clientQuestionPending (the repeat-tap guard) ─────────────────

test('pending: asked in this conversation for the draft\'s current client name', () => {
  const question = { typed: 'Maria', convo: 'c1' };
  assert.equal(clientQuestionPending({ question, convo: 'c1', draftName: 'Maria' }), true);
  assert.equal(clientQuestionPending({ question, convo: 'c1', draftName: '  MARIA ' }), true); // same key
});

test('not pending: nothing asked, another conversation, or the draft name changed', () => {
  const question = { typed: 'Maria', convo: 'c1' };
  assert.equal(clientQuestionPending({ question: null, convo: 'c1', draftName: 'Maria' }), false);
  assert.equal(clientQuestionPending({ question, convo: 'c2', draftName: 'Maria' }), false);
  assert.equal(clientQuestionPending({ question, convo: null, draftName: 'Maria' }), false);
  assert.equal(clientQuestionPending({ question, convo: 'c1', draftName: 'Maria Gonzalez' }), false);
  assert.equal(clientQuestionPending({ question, convo: 'c1', draftName: null }), false);
});
