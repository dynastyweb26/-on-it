// POST /api/transcribe — voice input via AssemblyAI.
// Receives an audio blob, returns { text }.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

const AAI = 'https://api.assemblyai.com/v2';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Guests and anon callers hit this too (voice is open pre-signup), so limit
  // by user-or-IP — previously anonymous callers had NO limit on AssemblyAI.
  if (!(await rateLimit('transcribe', rateIdentifier(req, user?.id)))) {
    return NextResponse.json(
      { error: 'rate limited', message: 'One sec — slow down a moment.' },
      { status: 429 }
    );
  }

  const audio = await req.arrayBuffer();
  if (!audio.byteLength || audio.byteLength > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'invalid audio' }, { status: 400 });
  }

  const headers = { authorization: process.env.ASSEMBLYAI_API_KEY! };

  // 1. Upload
  const up = await fetch(`${AAI}/upload`, { method: 'POST', headers, body: audio });
  const { upload_url } = await up.json();

  // 2. Request transcript
  const tr = await fetch(`${AAI}/transcript`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url, language_detection: true }),
  });
  const { id } = await tr.json();

  // 3. Poll (voice notes are short; this stays well under function limits)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await fetch(`${AAI}/transcript/${id}`, { headers });
    const data = await poll.json();
    if (data.status === 'completed') return NextResponse.json({ text: data.text ?? '' });
    if (data.status === 'error') break;
  }
  return NextResponse.json({ error: 'transcription failed' }, { status: 500 });
}
