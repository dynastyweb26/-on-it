// Two-pass audit_log redaction around the irreversible auth-user delete.
//
// Pass 1 runs BEFORE the delete: it scrubs the account's lifetime of
// INSERT/UPDATE rows, which are attributed to user_id and carry client names,
// amounts, and business details. The event trail (user_id, table, action,
// row_id, created_at) is kept; only the payload is dropped.
//
// The auth delete is not instantaneous, and service-role writers (Stripe
// webhooks, cron) can still land a row attributed to this user in the window
// between pass 1 and the delete. audit_log has no FK on user_id, so those rows
// are not removed by the cascade. Pass 2 runs AFTER the delete to scrub them.
//
// Pass 2 cannot roll anything back — the account is already gone — so a failure
// there is logged, not thrown.

/** The payload written over a redacted audit row. */
export const AUDIT_REDACTED_DETAIL = { redacted: true } as const;

/** The small slice of the service-role client this module needs. */
export type AuditRedactionAdmin = {
  from(table: 'audit_log'): {
    update(values: { detail: unknown }): {
      eq(column: 'user_id', value: string): PromiseLike<{ error: unknown }>;
    };
  };
};

/** Scrub every audit payload attributed to this user. Throws on failure. */
export async function redactUserAudit(
  admin: AuditRedactionAdmin,
  userId: string,
): Promise<void> {
  const { error } = await admin
    .from('audit_log')
    .update({ detail: AUDIT_REDACTED_DETAIL })
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Run the deletion in its required order: pre-delete scrub, the irreversible
 * delete, then the post-delete scrub that catches late writes.
 *
 * Returns the delete step's error so the caller can report delete_failed
 * distinctly. A pass-1 failure throws (the delete must not run); a pass-2
 * failure is logged only.
 */
export async function redactAuditAndDelete(
  admin: AuditRedactionAdmin,
  userId: string,
  deleteAccount: () => Promise<{ error: unknown }>,
): Promise<{ error: unknown }> {
  await redactUserAudit(admin, userId);

  const deleted = await deleteAccount();
  if (deleted.error) return deleted;

  try {
    await redactUserAudit(admin, userId);
  } catch (e) {
    console.error('delete-account: post-delete audit redaction failed', e);
  }

  return { error: null };
}
