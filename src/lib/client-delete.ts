import type { SupabaseClient } from '@supabase/supabase-js';

/** The fields the Clients list's Undo restores after a delete. */
export type ClientContactFields = {
  saved_at: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

/** Un-saving clears the saved flag and the contact fields, nothing else. */
export const UNSAVE_CLIENT_PATCH = {
  saved_at: null,
  phone: null,
  email: null,
  address: null,
  notes: null,
} as const;

export type UnsaveClientResult = {
  /** The row as it was, for Undo. Null when the read failed. */
  prev: ClientContactFields | null;
  error: string | null;
};

/**
 * The soft delete shared by the Clients list and the client detail page.
 * The client row and its invoices stay; only the saved/contact fields clear.
 */
export async function unsaveClient(
  supabase: SupabaseClient,
  id: string,
): Promise<UnsaveClientResult> {
  const { data, error } = await supabase
    .from('clients')
    .select('saved_at, phone, email, address, notes')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return { prev: null, error: error?.message ?? 'Client not found' };
  }

  const prev = data as ClientContactFields;
  const { error: updateError } = await supabase
    .from('clients')
    .update(UNSAVE_CLIENT_PATCH)
    .eq('id', id);

  return { prev, error: updateError?.message ?? null };
}
