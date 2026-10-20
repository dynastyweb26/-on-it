// Two-pass audit redaction around account deletion. The point of the second
// pass is the gap between the pre-delete scrub and the auth-user delete: a
// service-role writer (Stripe webhook, cron) can still attribute a new audit
// row to the user in that window, and audit_log has no FK, so the cascade does
// not remove it. The fake is an in-memory audit_log: update().eq() mutates the
// matching rows, exactly like the PostgREST builder the route awaits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  redactAuditAndDelete,
  AUDIT_REDACTED_DETAIL,
  type AuditRedactionAdmin,
} from './delete-account-audit';

type AuditRow = {
  id: number;
  user_id: string | null;
  table_name: string;
  action: string;
  detail: unknown;
};

/** In-memory audit_log; eq('user_id', v) redacts matching rows. */
function fakeAudit(rows: AuditRow[]) {
  const calls: string[] = [];
  const admin: AuditRedactionAdmin = {
    from(table: 'audit_log') {
      assert.equal(table, 'audit_log');
      return {
        update(values: { detail: unknown }) {
          return {
            async eq(column: string, value: string) {
              calls.push(`${column}=${value}`);
              for (const row of rows) {
                if (column === 'user_id' && row.user_id === value) {
                  row.detail = values.detail;
                }
              }
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { admin, rows, calls };
}

test('a service-role write between the scrub and the delete is redacted by the second pass', async () => {
  const { admin, rows, calls } = fakeAudit([
    { id: 1, user_id: 'user-1', table_name: 'invoices', action: 'UPDATE', detail: { client_name: 'Acme' } },
    { id: 2, user_id: 'user-1', table_name: 'profiles', action: 'UPDATE', detail: { business_name: 'Acme LLC' } },
  ]);

  const result = await redactAuditAndDelete(admin, 'user-1', async () => {
    // The pre-delete scrub must have run before the irreversible step.
    assert.equal(calls.length, 1, 'pass 1 ran before the delete');
    assert.deepEqual(rows[0].detail, AUDIT_REDACTED_DETAIL);

    // A Stripe webhook lands a service-role write in the gap.
    rows.push({
      id: 3,
      user_id: 'user-1',
      table_name: 'invoices',
      action: 'UPDATE',
      detail: { client_name: 'Late Co', total: '250.00' },
    });
    return { error: null };
  });

  assert.deepEqual(result, { error: null });
  assert.equal(calls.length, 2, 'both passes ran');
  for (const row of rows.filter((r) => r.user_id === 'user-1')) {
    assert.deepEqual(row.detail, AUDIT_REDACTED_DETAIL, `row ${row.id} still has its payload`);
  }
});

test('a pass-1 failure throws and the irreversible delete never runs', async () => {
  const { admin } = fakeAudit([
    { id: 1, user_id: 'user-1', table_name: 'invoices', action: 'UPDATE', detail: { client_name: 'Acme' } },
  ]);
  // Make the fake's update fail on the first pass.
  admin.from = () => ({
    update: () => ({ eq: async () => ({ error: { message: 'boom' } }) }),
  });

  let deleted = false;
  await assert.rejects(
    () =>
      redactAuditAndDelete(admin, 'user-1', async () => {
        deleted = true;
        return { error: null };
      }),
    (error) => {
      assert.deepEqual(error, { message: 'boom' });
      return true;
    },
  );
  assert.equal(deleted, false);
});

test('a delete failure is returned and the post-delete pass does not run', async () => {
  const { admin, rows, calls } = fakeAudit([
    { id: 1, user_id: 'user-1', table_name: 'invoices', action: 'UPDATE', detail: { client_name: 'Acme' } },
  ]);

  const result = await redactAuditAndDelete(admin, 'user-1', async () => ({
    error: { message: 'delete failed' },
  }));

  assert.deepEqual(result, { error: { message: 'delete failed' } });
  assert.equal(calls.length, 1, 'only the pre-delete pass ran');
  assert.deepEqual(rows[0].detail, AUDIT_REDACTED_DETAIL);
});
