'use client';
/* ═══ Voice mode — full-screen, turn-based ═══
   Glowing gold orb on cream. Auto-listens on open → records → transcribe
   → parse → reply spoken aloud → auto-listens for the answer. Loops until
   the invoice is ready, then closes to reveal the normal preview card.
   The conversation is shared state with the chat page, so everything said
   here appears in the text chat on exit.                                  */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { speak } from '@/lib/tts';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

const PHASE_HINT: Record<Phase, string> = {
  idle: 'Tap the orb to talk',
  listening: 'Listening… tap when you finish',
  thinking: 'Working on it…',
  speaking: '',
};

export interface VoiceSendResult {
  reply: string;
  ready: boolean;
}

export default function VoiceMode({
  onClose,
  sendMessage,
}: {
  onClose: () => void;
  /** Runs the shared chat parse flow; null means stop voice mode (error/auth). */
  sendMessage: (text: string) => Promise<VoiceSendResult | null>;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  // The turn loop runs through callbacks created in older renders; read the
  // latest sendMessage through a ref so each turn sees current chat state.
  const sendRef = useRef(sendMessage);
  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelSpeechRef = useRef<(() => void) | null>(null);
  const closedRef = useRef(false);

  function shutdown() {
    closedRef.current = true;
    cancelSpeechRef.current?.();
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null as never;
      recorderRef.current.stop();
    }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  function close() {
    shutdown();
    onClose();
  }

  async function startListening() {
    if (closedRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (closedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void processRecording(new Blob(chunksRef.current, { type: rec.mimeType }));
      };
      rec.start();
      recorderRef.current = rec;
      setPhase('listening');
    } catch {
      close(); // mic blocked — fall back to the text chat
    }
  }

  async function processRecording(blob: Blob) {
    if (closedRef.current) return;
    setPhase('thinking');
    let text = '';
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: blob });
      text = ((await res.json()).text ?? '').trim();
    } catch {
      /* fall through — treated as "didn't catch that" */
    }
    if (closedRef.current) return;

    if (!text) {
      sayThen("Sorry, I didn't catch that. Try again.", () => void startListening());
      return;
    }

    const result = await sendRef.current(text);
    if (closedRef.current) return;
    if (!result) {
      close();
      return;
    }
    if (result.ready) {
      // invoice is ready — speak the wrap-up, then reveal the preview card
      sayThen(result.reply, close);
    } else {
      sayThen(result.reply, () => void startListening());
    }
  }

  function sayThen(text: string, then: () => void) {
    setPhase('speaking');
    cancelSpeechRef.current = speak(text, {
      onDone: () => {
        cancelSpeechRef.current = null;
        if (!closedRef.current) then();
      },
    });
  }

  function orbTap() {
    if (phase === 'listening') {
      recorderRef.current?.stop(); // finish the turn
    } else if (phase === 'idle') {
      void startListening();
    } else if (phase === 'speaking') {
      // barge-in: stop talking and listen (speak()'s cancel fires onDone → listen)
      cancelSpeechRef.current?.();
    }
    // thinking: taps ignored
  }

  useEffect(() => {
    void startListening(); // auto-listen on open
    return shutdown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper">
      <button
        aria-label="Exit voice mode"
        className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-ink/60 active:scale-90"
        onClick={close}
      >
        <X size={22} />
      </button>

      <button aria-label="Talk" className={`orb orb-${phase}`} onClick={orbTap} />

      <p className="mt-10 h-6 text-[15px] text-ink/50">{PHASE_HINT[phase]}</p>
    </div>
  );
}
