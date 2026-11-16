// Browser side of POST /api/ai/confirm. The fetch is an argument so every outcome
// is unit-tested with a fake. The server decides everything: this file only sends
// the token with the card's one idempotency key and sorts the reply into what the
// card can paint. It never writes a status of its own.
//
// The key is minted once per card and reused on every retry, so a request that
// reached the server but lost its answer is replayed, never saved twice.

export type ConfirmRowResult = { actionId: string; status: 'saved' | 'failed'; problem: string | null };

/** Why a confirm did not settle, named for the person (rule 5). */
export type ConfirmCause =
  | 'expired'
  | 'already-done'
  | 'changed'
  | 'unsure'
  | 'signed-out'
  | 'rate-limited'
  | 'network'
  | 'server';

export type ConfirmOutcome =
  | { kind: 'settled'; state: 'done' | 'partial'; rows: ConfirmRowResult[] }
  | { kind: 'error'; cause: ConfirmCause; reply: string };

export const CONFIRM_COPY = {
  signedOut: "You're signed out. Sign in, then confirm.",
  rateLimited: 'One sec — slow down a moment.',
  offline: "You're offline, so that didn't go through. Tap Confirm when you're back.",
  // A dropped connection can land after the write did; the retry reuses the key, so it cannot save twice.
  dropped: "The connection dropped, so that may not have gone through. Tap Confirm again. It won't save twice.",
  server: "That didn't go through. Tap Confirm once more.",
} as const;

/** A reopened chat's unconfirmed card: the server's expired sentence, split into the card's two lines. */
export const EXPIRED_HEAD = ['Confirmation expired.', 'Ask me again and I will redo it.'] as const;

/** Cancel is the owner's own decision: no server call, nothing was saved. */
export const CANCELLED_HEAD = ['Cancelled.', 'Nothing was saved.'] as const;

const CAUSE_OF_CODE: Record<string, ConfirmCause> = {
  unknown_token: 'expired',
  expired_token: 'expired',
  already_confirmed: 'already-done',
  state_changed: 'changed',
  execute_failed: 'unsure',
};

/** One key per card: the first call mints it, every later call returns the same one. */
export function keyFor(keys: Map<string, string>, cardId: string, mint: () => string = () => crypto.randomUUID()): string {
  let key = keys.get(cardId);
  if (!key) {
    key = mint();
    keys.set(cardId, key);
  }
  return key;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function confirmProposal(
  token: string,
  idempotencyKey: string,
  fetchImpl: typeof fetch = fetch,
  online: () => boolean = () => (typeof navigator === 'undefined' ? true : navigator.onLine),
): Promise<ConfirmOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/ai/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, idempotencyKey }),
    });
  } catch {
    return { kind: 'error', cause: 'network', reply: online() ? CONFIRM_COPY.dropped : CONFIRM_COPY.offline };
  }
  const data = (await res.json().catch(() => null)) as unknown;
  const body = isObj(data) ? data : {};
  const reply = typeof body.reply === 'string' && body.reply.trim() ? body.reply : null;

  if (res.status === 401) return { kind: 'error', cause: 'signed-out', reply: reply ?? CONFIRM_COPY.signedOut };
  if (res.status === 429) return { kind: 'error', cause: 'rate-limited', reply: reply ?? CONFIRM_COPY.rateLimited };
  if (!res.ok || body.ok !== true) {
    const cause = (typeof body.error === 'string' && CAUSE_OF_CODE[body.error]) || 'server';
    return { kind: 'error', cause, reply: reply ?? CONFIRM_COPY.server };
  }

  const rows: ConfirmRowResult[] = Array.isArray(body.rows)
    ? body.rows.flatMap((r) =>
      isObj(r) && typeof r.actionId === 'string' && (r.status === 'saved' || r.status === 'failed')
        ? [{ actionId: r.actionId, status: r.status, problem: typeof r.problem === 'string' ? r.problem : null }]
        : [])
    : [];
  // A success with no per-row answer cannot be painted: say so, never guess saved.
  if (rows.length === 0) return { kind: 'error', cause: 'server', reply: CONFIRM_COPY.server };
  return { kind: 'settled', state: rows.some((r) => r.status === 'failed') ? 'partial' : 'done', rows };
}

/**
 * One request per card at a time, whoever asks. A second call while the first is
 * in flight gets the same promise (and sends nothing); the slot clears on every
 * exit, so the next tap after a failure can try again.
 */
export function shareInflight<T>(inflight: Map<string, Promise<T>>, cardId: string, run: () => Promise<T>): Promise<T> {
  const running = inflight.get(cardId);
  if (running) return running;
  const p = run().finally(() => inflight.delete(cardId));
  inflight.set(cardId, p);
  return p;
}
