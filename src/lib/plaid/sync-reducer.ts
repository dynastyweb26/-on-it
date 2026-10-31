// ═══ Plaid transactions/sync — pure page reducer ═══
// Turns one /transactions/sync page into the exact writes the sync executor
// makes. Everything here is pure (no Supabase, no fetch, no env), so the
// money-out rules, the review-state rules and the dedupe are unit-tested.
//
// Rules encoded here:
//   - posted only: pending transactions are skipped; a pending → posted change
//     arrives as remove(pending) + add(posted), and the posted add carries
//     pending_transaction_id, so it updates the row we already have instead of
//     inserting a duplicate;
//   - money out only: amount > 0 (Plaid's sign convention);
//   - staged only from the link date forward (the caller's windowStart);
//   - dedupe: one row per (user_id, plaid_transaction_id) — the working map is
//     keyed by the Plaid id, so a repeated id in one page yields one write;
//   - modified/removed on an 'added'/'already' row → 'needs_review' (never a
//     silent change to an expense); on 'new'/'ignored' → update, or mark the
//     bank state removed.

export type BankState = 'pending' | 'posted' | 'removed';
export type ReviewState = 'new' | 'added' | 'already' | 'ignored' | 'needs_review';

/** The Plaid transaction fields this feature reads. */
export type PlaidSyncTransaction = {
  transaction_id: string;
  account_id: string;
  pending: boolean;
  amount: number;
  name: string;
  merchant_name?: string | null;
  authorized_date?: string | null;
  date: string;
  pending_transaction_id?: string | null;
  personal_finance_category?: { primary?: string | null } | null;
};

export type PlaidRemovedTransaction = {
  transaction_id: string;
  pending_transaction_id?: string | null;
};

/** The columns the reducer needs from an existing bank_transactions row. */
export type ExistingBankRow = {
  id: string;
  plaid_transaction_id: string;
  bank_state: BankState;
  review_state: ReviewState;
  expense_id: string | null;
};

export type BankInsert = {
  user_id: string;
  item_id: string;
  account_id: string;
  plaid_transaction_id: string;
  description: string;
  merchant: string | null;
  amount: number;
  occurred_on: string;
  authorized_on: string | null;
  category: string | null;
  bank_state: 'posted';
  review_state: ReviewState;
};

export type BankUpdate = {
  id: string;
  patch: Record<string, unknown>;
};

export type SyncSkipCounts = {
  pending: number;
  moneyIn: number;
  outsideWindow: number;
  untrackedAccount: number;
  unknownRemoved: number;
  removedBeforeInsert: number;
};

export type SyncPlan = {
  inserts: BankInsert[];
  updates: BankUpdate[];
  skipped: SyncSkipCounts;
};

export type PlanInput = {
  userId: string;
  itemId: string;
  added: PlaidSyncTransaction[];
  modified: PlaidSyncTransaction[];
  removed: PlaidRemovedTransaction[];
  existing: ExistingBankRow[];
  /** Plaid account id → plaid_accounts.id, tracked accounts only. */
  trackedAccountIds: Record<string, string>;
  /** yyyy-mm-dd: linked_at date, never older than the ~30 day cap. */
  windowStart: string;
  /** ISO timestamp for removed_at. */
  removedAt: string;
};

type Fields = {
  accountId: string;
  description: string;
  merchant: string | null;
  amount: number;
  occurredOn: string;
  authorizedOn: string | null;
  category: string | null;
};

type Working = {
  dbId: string | null;
  plaidId: string;
  originalPlaidId: string;
  initialBankState: BankState;
  initialReviewState: ReviewState;
  bankState: BankState;
  reviewState: ReviewState;
  fields: Fields | null;
  touched: boolean;
};

const DECIDED: ReviewState[] = ['added', 'already'];

const blankSkips = (): SyncSkipCounts => ({
  pending: 0,
  moneyIn: 0,
  outsideWindow: 0,
  untrackedAccount: 0,
  unknownRemoved: 0,
  removedBeforeInsert: 0,
});

const text = (value: string | null | undefined, max: number, fallback = ''): string =>
  (value ?? '').trim().slice(0, max) || fallback;

const money = (amount: number): number => Math.round(amount * 100) / 100;

function fieldsOf(txn: PlaidSyncTransaction, accountId: string): Fields {
  const authorized = (txn.authorized_date ?? '').trim() || null;
  const posted = authorized ?? (txn.date ?? '').trim();
  return {
    accountId,
    description: text(txn.name, 300, text(txn.merchant_name, 300, 'Bank transaction')),
    merchant: text(txn.merchant_name, 200) || null,
    amount: money(txn.amount),
    occurredOn: posted,
    authorizedOn: authorized,
    category: text(txn.personal_finance_category?.primary ?? null, 60) || null,
  };
}

/**
 * One page → insert/update writes. Existing rows are keyed by their Plaid id;
 * new rows are staged and only written when they end the page posted.
 */
export function planTransactionPage(input: PlanInput): SyncPlan {
  const plan: SyncPlan = { inserts: [], updates: [], skipped: blankSkips() };
  const work = new Map<string, Working>();

  for (const row of input.existing) {
    work.set(row.plaid_transaction_id, {
      dbId: row.id,
      plaidId: row.plaid_transaction_id,
      originalPlaidId: row.plaid_transaction_id,
      initialBankState: row.bank_state,
      initialReviewState: row.review_state,
      bankState: row.bank_state,
      reviewState: row.review_state,
      fields: null,
      touched: false,
    });
  }

  const applyUpsert = (txn: PlaidSyncTransaction): void => {
    if (txn.pending) {
      plan.skipped.pending++;
      return;
    }
    if (!(txn.amount > 0)) {
      plan.skipped.moneyIn++;
      return;
    }
    const accountId = input.trackedAccountIds[txn.account_id];
    if (!accountId) {
      plan.skipped.untrackedAccount++;
      return;
    }

    let entry =
      work.get(txn.transaction_id) ??
      (txn.pending_transaction_id ? work.get(txn.pending_transaction_id) : undefined);

    if (!entry) {
      const fields = fieldsOf(txn, accountId);
      // The window only gates new rows; a modification of a row we already
      // hold is applied even if its date sits behind the window.
      if (fields.occurredOn < input.windowStart) {
        plan.skipped.outsideWindow++;
        return;
      }
      entry = {
        dbId: null,
        plaidId: txn.transaction_id,
        originalPlaidId: txn.transaction_id,
        initialBankState: 'posted',
        initialReviewState: 'new',
        bankState: 'posted',
        reviewState: 'new',
        fields,
        touched: true,
      };
      work.set(txn.transaction_id, entry);
      return;
    }

    // pending → posted: the posted id replaces the pending id on the same row.
    if (entry.plaidId !== txn.transaction_id) {
      work.delete(entry.plaidId);
      entry.plaidId = txn.transaction_id;
      work.set(txn.transaction_id, entry);
    }

    entry.fields = fieldsOf(txn, accountId);
    // 'added' / 'already' point at an expense: never change it silently.
    if (DECIDED.includes(entry.reviewState)) entry.reviewState = 'needs_review';
    entry.bankState = 'posted';
    entry.touched = true;
  };

  for (const txn of input.added) applyUpsert(txn);
  for (const txn of input.modified) applyUpsert(txn);

  for (const removed of input.removed) {
    const entry =
      work.get(removed.transaction_id) ??
      (removed.pending_transaction_id ? work.get(removed.pending_transaction_id) : undefined);
    if (!entry) {
      plan.skipped.unknownRemoved++;
      continue;
    }
    if (DECIDED.includes(entry.reviewState)) entry.reviewState = 'needs_review';
    entry.bankState = 'removed';
    entry.touched = true;
  }

  for (const entry of work.values()) {
    if (!entry.touched) continue;

    if (entry.dbId === null) {
      if (!entry.fields) continue;
      // A transaction added and removed inside one page never existed in the
      // ledger; stage nothing rather than a row that is born removed.
      if (entry.bankState === 'removed') {
        plan.skipped.removedBeforeInsert++;
        continue;
      }
      const f = entry.fields;
      plan.inserts.push({
        user_id: input.userId,
        item_id: input.itemId,
        account_id: f.accountId,
        plaid_transaction_id: entry.plaidId,
        description: f.description,
        merchant: f.merchant,
        amount: f.amount,
        occurred_on: f.occurredOn,
        authorized_on: f.authorizedOn,
        category: f.category,
        bank_state: 'posted',
        review_state: 'new',
      });
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (entry.plaidId !== entry.originalPlaidId) {
      patch.plaid_transaction_id = entry.plaidId;
    }
    if (entry.fields) {
      patch.account_id = entry.fields.accountId;
      patch.description = entry.fields.description;
      patch.merchant = entry.fields.merchant;
      patch.amount = entry.fields.amount;
      patch.occurred_on = entry.fields.occurredOn;
      patch.authorized_on = entry.fields.authorizedOn;
      patch.category = entry.fields.category;
    }
    if (entry.bankState !== entry.initialBankState) {
      patch.bank_state = entry.bankState;
      patch.removed_at = entry.bankState === 'removed' ? input.removedAt : null;
    }
    if (entry.reviewState !== entry.initialReviewState) {
      patch.review_state = entry.reviewState;
    }
    if (Object.keys(patch).length > 0) {
      plan.updates.push({ id: entry.dbId, patch });
    }
  }

  return plan;
}
