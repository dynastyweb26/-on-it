// POST /api/realtime/session — Issues ephemeral session tokens for OpenAI Realtime API WebRTC/WebSocket client connections.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await rateLimit('realtime', rateIdentifier(req, user?.id)))) {
    return NextResponse.json(
      { error: 'rate limited', message: 'One moment — please try again shortly.' },
      { status: 429 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // If key is not configured in environment, return a clear fallback payload so the UI gracefully degrades to Web Speech / Transcribe API
    return NextResponse.json(
      { error: 'realtime_disabled', message: 'OpenAI Realtime key not configured.' },
      { status: 503 }
    );
  }

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'verse',
        modalities: ['audio', 'text'],
        instructions: `You are "On It", an omnipresent business operator for handymen, contractors, and service pros. Speak naturally, directly, and concisely without jargon or markdown. Be patient with pauses and allow barge-in interruptions.`,
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Realtime session error:', response.status, errText);
      return NextResponse.json({ error: 'failed_session_creation', message: errText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Realtime session exception:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
