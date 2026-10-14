// Preferences helper module for storing and retrieving user-level conversational preferences.
import { createClient } from '@/lib/supabase/server';

export interface UserPreferences {
  service_term?: string;       // e.g. "service call", "job", "appointment"
  default_notes?: string;      // default terms or notes on invoices
  report_period?: string;      // preferred summary date range ("week" | "month")
  category_mappings?: Record<string, string>; // custom terms to expense category
  custom_preferences?: Record<string, unknown>;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('preferences, notes')
    .eq('id', userId)
    .maybeSingle();

  // Parse notes or return defaults
  return {
    service_term: 'job',
    report_period: 'month',
    ...((data as unknown as Record<string, unknown>)?.preferences ?? {} as UserPreferences)
  };
}

export async function saveUserPreferences(userId: string, prefs: Partial<UserPreferences>): Promise<boolean> {
  const supabase = await createClient();
  const existing = await getUserPreferences(userId);
  const updated = { ...existing, ...prefs };

  const { error } = await supabase
    .from('profiles')
    .update({ preferences: updated } as unknown as Record<string, unknown>)
    .eq('id', userId);

  return !error;
}
