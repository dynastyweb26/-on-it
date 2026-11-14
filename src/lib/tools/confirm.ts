// ═══ AI Smart · pending actions, confirm tokens, idempotent replay ═══
//
// A write or send tool never runs inside a model turn. It returns a PENDING
// ACTION with a one-time confirm token; a separate endpoint executes it when the
// owner confirms. That is the whole safety property: the model can propose a
// write, but it cannot perform one.
//
// Idempotency: the client sends one key per confirm request. A replay with the
// same key returns the recorded result and executes nothing, so a double tap, a
// retry after a timeout, or a resend writes ONE row. Several tokens in one
// request are confirmed together, atomically: if one is unknown, expired or
// already used, nothing executes.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ProposalRow, Registry, WriteContext } from './contract';

/** How long a proposed action stays confirmable. */
export const CONFIRM_TOKEN_TTL_MS = 15 * 60 * 1000;

/** The only tool types that can ever be confirmed. */
export const CONFIRMABLE_TYPES = ['write', 'send'] as const;

export type PendingAction = {
  id: string;
  userId: string;
  tool: string;
  /** What prepare() validated: exact ids and values, never the model's args. */
  resolved: unknown;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  executedAt: string | null;
};

export type ExecutedAction =
  | {
    actionId: string;
    tool: string;
    /** Per-row state the confirm card paints. */
    status: 'saved';
    result: unknown;
  }
  | {
    actionId: string;
    tool: string;
    /** This row refused; the sentence says why, composed by the server. */
    status: 'failed';
    problem: string;
  };

/**
 * The sentence a proposal is read with. Server-composed from the row prepare
 * built, so it says what is READY, never what was saved.
 */
export function confirmSentence(row: ProposalRow): string {
  return `Ready to confirm: ${row.summary}.`;
}

export type RecordedCommit = { actions: ExecutedAction[] };

/**
 * Persistence for the two tables (supabase/migrations/…_tool_pending_actions.sql).
 * Implemented over the caller's own session, so RLS owns visibility.
 */
export interface PendingStore {
  insert(action: PendingAction): Promise<void>;
  findByTokenHash(userId: string, tokenHash: string): Promise<PendingAction | null>;
  markExecuted(userId: string, actionId: string): Promise<void>;
  findCommit(userId: string, idempotencyKey: string): Promise<RecordedCommit | null>;
  insertCommit(userId: string, idempotencyKey: string, commit: RecordedCommit): Promise<void>;
}

/** A batch is done when every row saved, partial once any row refused. */
function stateOf(actions: readonly ExecutedAction[]): 'done' | 'partial' {
  return actions.every((action) => action.status === 'saved') ? 'done' : 'partial';
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Constant-time compare of two hex digests. */
export function sameTokenHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export type CreatedAction = { id: string; token: string; expiresAt: string };

/**
 * Record a proposed write and hand back the one-time token. Only the hash is
 * stored: a leaked table row cannot be turned into a working confirm.
 */
export async function createPendingAction(input: {
  userId: string;
  tool: string;
  resolved: unknown;
  store: PendingStore;
  now?: Date;
}): Promise<CreatedAction> {
  const now = input.now ?? new Date();
  const token = randomBytes(32).toString('base64url');
  const action: PendingAction = {
    id: randomUUID(),
    userId: input.userId,
    tool: input.tool,
    resolved: input.resolved,
    tokenHash: sha256(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CONFIRM_TOKEN_TTL_MS).toISOString(),
    executedAt: null,
  };
  await input.store.insert(action);
  return { id: action.id, token, expiresAt: action.expiresAt };
}

export type ConfirmFailure =
  | 'unknown_token'
  | 'expired_token'
  | 'already_confirmed'
  | 'not_executable'
  /** execute() re-validated and the world moved: nothing was written. */
  | 'state_changed';

export type ConfirmResult =
  | {
    ok: true;
    actions: ExecutedAction[];
    replayed: boolean;
    /** Every row saved, or some saved and at least one refused. */
    state: 'done' | 'partial';
  }
  | { ok: false; reason: ConfirmFailure; problem?: string };

/**
 * Execute one or more confirmed actions under the caller's own session.
 *
 * All-or-nothing on validation: every token is checked before anything runs.
 * All-or-nothing on replay: one idempotency key, one recorded result.
 */
export async function confirmActions(input: {
  userId: string;
  tokens: readonly string[];
  idempotencyKey?: string | null;
  store: PendingStore;
  registry: Registry;
  /** Built by /api/ai/confirm only; a model turn can never obtain one. */
  wctx: WriteContext;
  now?: Date;
}): Promise<ConfirmResult> {
  const now = input.now ?? new Date();
  const key = input.idempotencyKey?.trim() || null;

  // Replay first: the key is the promise that this request already happened.
  if (key) {
    const recorded = await input.store.findCommit(input.userId, key);
    if (recorded) return { ok: true, actions: recorded.actions, replayed: true, state: stateOf(recorded.actions) };
  }

  const tokens = [...new Set(input.tokens.map((t) => t.trim()).filter(Boolean))];
  if (tokens.length === 0) return { ok: false, reason: 'unknown_token' };

  const resolved: Array<{ action: PendingAction; tool: ReturnType<Registry['get']> }> = [];
  for (const token of tokens) {
    const action = await input.store.findByTokenHash(input.userId, sha256(token));
    if (!action) return { ok: false, reason: 'unknown_token' };
    if (action.userId !== input.userId) return { ok: false, reason: 'unknown_token' };
    if (action.executedAt) return { ok: false, reason: 'already_confirmed' };
    if (new Date(action.expiresAt).getTime() <= now.getTime()) {
      return { ok: false, reason: 'expired_token' };
    }

    const tool = input.registry.find(action.tool);
    if (!tool) return { ok: false, reason: 'not_executable' };
    if (!(CONFIRMABLE_TYPES as readonly string[]).includes(tool.type)) {
      // A read, nav or meta tool never needs a confirm and never gets one here.
      return { ok: false, reason: 'not_executable' };
    }
    resolved.push({ action, tool });
  }

  const actions: ExecutedAction[] = [];
  /** The first refusal, so a request that saved nothing can fail as a whole. */
  let refusal: { reason: ConfirmFailure; problem: string } | null = null;

  for (const { action, tool } of resolved) {
    if (!tool.execute) return { ok: false, reason: 'not_executable' };
    // execute re-validates what prepare saw. One refused row does not undo the
    // rows already saved: each is reported on its own and the card goes partial.
    const outcome = await tool.execute(input.wctx, action.resolved);
    if (!outcome.ok) {
      actions.push({ actionId: action.id, tool: tool.name, status: 'failed', problem: outcome.problem });
      refusal ??= { reason: 'state_changed', problem: outcome.problem };
      continue;
    }
    const result = tool.output.parse(outcome.result);
    await input.store.markExecuted(input.userId, action.id);
    actions.push({ actionId: action.id, tool: tool.name, status: 'saved', result });
  }

  // Nothing was written, so the request failed: the route answers with the real
  // cause and the tool's own sentence, exactly as a single-row confirm would.
  const saved = actions.filter((action) => action.status === 'saved');
  if (saved.length === 0 && refusal) {
    return { ok: false, reason: refusal.reason, problem: refusal.problem };
  }
  const state = stateOf(actions);

  if (key) {
    try {
      await input.store.insertCommit(input.userId, key, { actions });
    } catch {
      // Two confirms raced on the same key. The first write stands; return it so
      // the caller sees one outcome, not an error and not a second row.
      const recorded = await input.store.findCommit(input.userId, key);
      if (recorded) return { ok: true, actions: recorded.actions, replayed: true, state: stateOf(recorded.actions) };
      throw new Error('confirm commit failed');
    }
  }

  return { ok: true, actions, replayed: false, state };
}
