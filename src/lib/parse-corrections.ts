import { createClient } from '@/lib/supabase/client';

export interface RecordCorrectionParams {
  rawInput?: string | null;
  modelOutput: Record<string, unknown>;
  correctedOutput: Record<string, unknown>;
  correctionType: 'manual_edit' | 'ai_amend';
}

export async function recordParseCorrection(params: RecordCorrectionParams): Promise<void> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('parse_corrections').insert({
      user_id: user.id,
      raw_input: params.rawInput ?? null,
      model_output: params.modelOutput,
      corrected_output: params.correctedOutput,
      correction_type: params.correctionType,
    });
  } catch (err) {
    console.error('Failed to record parse correction:', err);
  }
}
