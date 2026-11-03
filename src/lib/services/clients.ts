// ═══ Client match-or-create service ═══
// One explicit function for "which client is this?" so that nothing creates a
// duplicate by accident ("Maria" and "Maria G" used to become two clients).
//
//   matchClient()          pure: input + the candidate rows -> an outcome.
//   matchOrCreateClient()  loads candidates through the CALLER'S user-scoped
//                          client, runs matchClient(), and creates only when
//                          there is no plausible match.
//
// Rules:
//   * Takes a user-scoped Supabase client (RLS applies); never the service role.
//   * Never takes a client id. Ids only ever come back out, from rows this
//     service read, so a model-supplied id can't reach a write through here.
//   * An exact case-insensitive name match always wins, even when longer
//     names that start with it also exist ("Maria" beats "Maria Gonzalez").
//   * Close-but-not-exact is 'ambiguous' and creates NOTHING; the caller asks.
//   * A soft-deleted exact match is returned as-is (the unique name_key index
//     covers deleted rows, so creating it again would collide); save_client
//     revives it when the user saves.
//   * Email or phone can confirm a match only when the names are compatible
//     (one is a word-prefix of the other). A shared phone or email with a
//     clearly different name ("Jose" vs "Maria") is 'ambiguous', never a
//     silent merge.
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientNameKey } from '@/lib/client-name';

export type ClientRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  saved_at: string | null;
  deleted_at: string | null;
};

export type ClientInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type MatchOutcome =
  | { status: 'matched'; client: ClientRecord; via: 'name' | 'email' | 'phone' }
  | { status: 'ambiguous'; candidates: ClientRecord[] }
  | { status: 'none' }
  | { status: 'invalid'; reason: 'empty' | 'too_long' };

export type MatchOrCreateResult =
  | { status: 'matched'; client: ClientRecord; via: 'name' | 'email' | 'phone'; linked?: number }
  | { status: 'created'; client: ClientRecord; linked?: number }
  | { status: 'ambiguous'; candidates: ClientRecord[] }
  | { status: 'invalid'; reason: 'empty' | 'too_long' };

export type MatchOptions = {
  /** Also save the client (saved_at) and link past documents: the save_client RPC. */
  save?: boolean;
  /** The user already answered "which client?" with "a new one": create despite ambiguity. */
  createIfAmbiguous?: boolean;
};

const NAME_MAX = 120; // clients.name check (1-120)
const COLS = 'id, name, email, phone, address, saved_at, deleted_at';

// ── Pure matching ────────────────────────────────────────────────

/** Lowercased words, outer punctuation stripped ("Maria G." -> ['maria', 'g']). */
function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

/**
 * Whether two different names could be the same client: one is a word-prefix
 * of the other, the last word of the shorter allowed to be partial.
 * "Maria" ~ "Maria Gonzalez", "Maria G" ~ "Maria Gonzalez", "Acme" ~ "Acme
 * Roofing". "Maria Gonzalez" vs "Maria Lopez" are NOT related.
 */
export function namesRelated(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  for (let i = 0; i < short.length - 1; i++) {
    if (short[i] !== long[i]) return false;
  }
  return long[short.length - 1].startsWith(short[short.length - 1]);
}

function emailKey(e: string | null | undefined): string | null {
  const s = (e ?? '').trim().toLowerCase();
  return s || null;
}

/** Last 10 digits when there are at least 7, else null (too short to trust). */
function phoneKey(p: string | null | undefined): string | null {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-10) : null;
}

export function matchClient(input: ClientInput, existing: ClientRecord[]): MatchOutcome {
  const name = (input.name ?? '').replace(/^ +| +$/g, '');
  if (!name || !tokens(name).length) return { status: 'invalid', reason: 'empty' };
  if (name.length > NAME_MAX) return { status: 'invalid', reason: 'too_long' };

  // 1. Exact, case-insensitive (the database's name_key). Always wins, and may
  //    be a soft-deleted row: returned as-is.
  const key = clientNameKey(name);
  const exact = existing.find((c) => clientNameKey(c.name) === key);
  if (exact) return { status: 'matched', client: exact, via: 'name' };

  // Deleted rows are never offered as a "did you mean"; only an exact name can
  // bring one back (above).
  const live = existing.filter((c) => c.deleted_at == null);

  // 2. Email / phone confirm a match only with a compatible name.
  const ek = emailKey(input.email);
  const pk = phoneKey(input.phone);
  const contactHits = live.filter(
    (c) => (ek != null && emailKey(c.email) === ek) || (pk != null && phoneKey(c.phone) === pk),
  );
  const compatible = contactHits.filter((c) => namesRelated(name, c.name));
  if (compatible.length === 1) {
    const c = compatible[0];
    return { status: 'matched', client: c, via: ek != null && emailKey(c.email) === ek ? 'email' : 'phone' };
  }

  // 3. Anything close but not exact, or a contact hit with a different name,
  //    is a question for the user, never a silent create or merge.
  const related = live.filter((c) => namesRelated(name, c.name));
  const seen = new Set<string>();
  const candidates = [...compatible, ...related, ...contactHits].filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  return candidates.length ? { status: 'ambiguous', candidates } : { status: 'none' };
}

// ── Supabase-backed service ──────────────────────────────────────

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

async function loadCandidates(
  supabase: SupabaseClient,
  userId: string,
  input: ClientInput,
): Promise<ClientRecord[]> {
  const key = clientNameKey((input.name ?? '').replace(/^ +| +$/g, ''));
  const first = tokens(input.name)[0] ?? '';
  const email = (input.email ?? '').trim();
  const phone = (input.phone ?? '').trim();

  const base = () => supabase.from('clients').select(COLS).eq('user_id', userId);
  const queries = [
    base().eq('name_key', key).limit(1),
    ...(first ? [base().like('name_key', `${likeEscape(first)}%`).limit(25)] : []),
    ...(email ? [base().ilike('email', likeEscape(email)).limit(10)] : []),
    ...(phone ? [base().eq('phone', phone).limit(10)] : []),
  ];
  const results = await Promise.all(queries);
  const rows = new Map<string, ClientRecord>();
  for (const r of results) {
    if (r.error) throw new Error(`client lookup failed: ${r.error.message}`);
    for (const row of (r.data ?? []) as ClientRecord[]) rows.set(row.id, row);
  }
  return [...rows.values()];
}

/**
 * Refresh contact on a client the caller already resolved: address and phone
 * overwrite when given (a corrected address is stored), blanks never wipe.
 * Takes an id the caller got from this service, never from the model.
 */
export async function updateClientContact(
  supabase: SupabaseClient,
  clientId: string,
  contact: { address?: string | null; phone?: string | null },
): Promise<void> {
  const patch: Record<string, string> = {};
  const address = (contact.address ?? '').trim();
  const phone = (contact.phone ?? '').trim();
  if (address) patch.address = address;
  if (phone) patch.phone = phone;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase.from('clients').update(patch).eq('id', clientId);
  if (error) throw new Error(`client update failed: ${error.message}`);
}

export async function matchOrCreateClient(
  supabase: SupabaseClient,
  userId: string,
  input: ClientInput,
  opts: MatchOptions = {},
): Promise<MatchOrCreateResult> {
  const name = (input.name ?? '').replace(/^ +| +$/g, '');
  // Reject before touching the database.
  const pre = matchClient({ ...input, name }, []);
  if (pre.status === 'invalid') return pre;

  const outcome = matchClient({ ...input, name }, await loadCandidates(supabase, userId, input));
  if (outcome.status === 'invalid') return outcome;
  if (outcome.status === 'ambiguous' && !opts.createIfAmbiguous) {
    return { status: 'ambiguous', candidates: outcome.candidates };
  }

  const address = (input.address ?? '').trim() || null;
  const phone = (input.phone ?? '').trim() || null;
  const email = (input.email ?? '').trim() || null;

  // save mode: the RPC does the saving and the past-document linking. It runs
  // with the stored spelling on a match, so it can never fork a new row.
  if (opts.save) {
    const rpcName = outcome.status === 'matched' ? outcome.client.name : name;
    const { data, error } = await supabase.rpc('save_client', {
      p_name: rpcName, p_phone: phone, p_email: email, p_address: address, p_notes: null,
    });
    const row = (Array.isArray(data) ? data[0] : data) as { id?: string; linked?: number } | null;
    if (error || !row?.id) throw new Error(`save_client failed: ${error?.message ?? 'no row'}`);
    const client: ClientRecord = outcome.status === 'matched'
      ? { ...outcome.client, saved_at: outcome.client.saved_at ?? new Date().toISOString(), deleted_at: null }
      : { id: row.id, name: rpcName, email, phone, address, saved_at: new Date().toISOString(), deleted_at: null };
    return outcome.status === 'matched'
      ? { status: 'matched', client, via: outcome.via, linked: row.linked }
      : { status: 'created', client, linked: row.linked };
  }

  if (outcome.status === 'matched') {
    await updateClientContact(supabase, outcome.client.id, { address, phone });
    return {
      status: 'matched',
      via: outcome.via,
      client: { ...outcome.client, address: address ?? outcome.client.address, phone: phone ?? outcome.client.phone },
    };
  }

  // Nothing plausible (or the user said "new client"): create it, unsaved, the
  // same as the old implicit upsert did.
  const row: Record<string, string> = { user_id: userId, name };
  if (address) row.address = address;
  if (phone) row.phone = phone;
  if (email) row.email = email;
  const ins = await supabase.from('clients').insert(row).select(COLS).single();
  if (ins.error) {
    // Lost a race with another tab: the name now exists, so it is a match.
    if (ins.error.code === '23505') {
      const again = await supabase.from('clients').select(COLS).eq('user_id', userId)
        .eq('name_key', clientNameKey(name)).maybeSingle();
      if (again.data) return { status: 'matched', client: again.data as ClientRecord, via: 'name' };
    }
    throw new Error(`client create failed: ${ins.error.message}`);
  }
  return { status: 'created', client: ins.data as ClientRecord };
}
