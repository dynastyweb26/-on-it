// An in-memory PendingStore with the same guarantees as the table: one token
// row per (user, hash), one commit per (user, idempotency key). Used by the
// confirm tests and the shared safety suite so they need no network.
import type { PendingAction, PendingStore, RecordedCommit } from './confirm';

export type FixturePendingStore = PendingStore & {
  actions: Map<string, PendingAction>;
  commits: Map<string, RecordedCommit>;
  /** Claims this store granted, for the one-write assertions. */
  executions: string[];
  releases: string[];
  interrupts: number;
};

const commitId = (userId: string, key: string) => `${userId}:${key}`;

export function fixturePendingStore(seed: readonly PendingAction[] = []): FixturePendingStore {
  const actions = new Map<string, PendingAction>(seed.map((a) => [`${a.userId}:${a.tokenHash}`, a]));
  const commits = new Map<string, RecordedCommit>();
  const executions: string[] = [];
  const releases: string[] = [];

  return {
    actions,
    commits,
    executions,
    releases,
    interrupts: 0,
    async insert(action: PendingAction) {
      // The fixture stores the same field the table does: resolved ids only.
      const key = `${action.userId}:${action.tokenHash}`;
      if (actions.has(key)) throw new Error('duplicate confirm token');
      actions.set(key, { ...action });
    },
    async findByTokenHash(userId: string, tokenHash: string) {
      return actions.get(`${userId}:${tokenHash}`) ?? null;
    },
    async claim(userId: string, actionId: string) {
      for (const [key, action] of actions) {
        if (action.userId === userId && action.id === actionId) {
          // Same rule as the UPDATE: a claimed row cannot be claimed again.
          if (action.executedAt) return false;
          actions.set(key, { ...action, executedAt: new Date().toISOString() });
          executions.push(actionId);
          return true;
        }
      }
      return false;
    },
    async release(userId: string, actionId: string) {
      for (const [key, action] of actions) {
        if (action.userId === userId && action.id === actionId) {
          actions.set(key, { ...action, executedAt: null });
          releases.push(actionId);
          return;
        }
      }
      throw new Error('pending action not found');
    },
    async findCommit(userId: string, idempotencyKey: string) {
      return commits.get(commitId(userId, idempotencyKey)) ?? null;
    },
    async insertCommit(userId: string, idempotencyKey: string, commit: RecordedCommit) {
      const key = commitId(userId, idempotencyKey);
      if (commits.has(key)) throw new Error('duplicate idempotency key');
      commits.set(key, commit);
    },
  };
}
