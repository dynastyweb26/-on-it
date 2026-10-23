// Shared server helpers for the owner estimate routes. Every route re-checks
// ownership here with the service-role client; nothing about the row is trusted
// from the request.
import 'server-only';
import { adminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export type OwnedQuote = {
  id: string;
  user_id: string;
  kind: string | null;
  status: string | null;
  deleted_at: string | null;
  approved_at: string | null;
  revoked_at: string | null;
  valid_until: string | null;
  public_token: string | null;
  [key: string]: unknown;
};

export async function loadOwnedQuote(id: string, userId: string): Promise<OwnedQuote | null> {
  const { data, error } = await adminClient()
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as OwnedQuote | null;
  if (!row || row.kind !== 'quote' || row.deleted_at) return null;
  return row;
}

export async function hasConverted(id: string): Promise<boolean> {
  const { data, error } = await adminClient()
    .from('invoices')
    .select('id')
    .eq('converted_from', id)
    .is('deleted_at', null)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Approved or converted estimates are frozen: no send, extend, revoke, or
 *  attachment change. */
export async function isLocked(row: OwnedQuote): Promise<boolean> {
  if (row.approved_at) return true;
  return hasConverted(row.id);
}
