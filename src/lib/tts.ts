// ═══ ON IT — Voice-mode TTS ═══
// Only voice mode speaks. Text mode is always silent.
// Quality tuning: male English voice, rate ~0.95, sentence-by-sentence
// queueing so periods and commas produce real pauses.
//
// iOS Safari only lets speechSynthesis start from a user gesture. A voice reply
// is spoken deep in an async chain (transcribe → parse → speak), so it would be
// blocked. Call primeSpeech() inside the mic-tap gesture handler to unlock
// playback for the later async reply. Voices also load asynchronously (empty on
// the first getVoices() call on iOS/Chrome), so speak() awaits the list before
// selecting a voice.

const PREFERRED_NAMES = ['aaron', 'daniel', 'alex', 'arthur', 'google us english'];

/** Resolve once the browser's voices list is populated. getVoices() is empty on
 *  the first call in iOS Safari / Chrome until 'voiceschanged' fires; some
 *  engines never fire it, so we also poll, and time out to whatever is loaded
 *  (degrade to default rather than hang). */
export function voicesReady(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([]);
  const loaded = speechSynthesis.getVoices();
  if (loaded.length) return Promise.resolve(loaded);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      speechSynthesis.removeEventListener?.('voiceschanged', finish);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener?.('voiceschanged', finish, { once: true });
    let waited = 0;
    const poll = setInterval(() => {
      waited += 100;
      if (speechSynthesis.getVoices().length || waited >= timeoutMs) finish();
    }, 100);
  });
}

/** iOS Safari unlocks speechSynthesis only from a user gesture. Call this inside
 *  a tap handler: it nudges the voices list to load and speaks a silent
 *  utterance so a later async reply is permitted to play. Best-effort and
 *  idempotent — safe to call on every tap. */
export function primeSpeech(): void {
  if (typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.getVoices(); // kick the async voices list
    speechSynthesis.resume();    // clear any paused state left by a prior session
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;                // silent — this call only unlocks the engine
    speechSynthesis.speak(u);
  } catch { /* priming is best-effort; never block the tap */ }
}

/** Pick a male English voice via a fallback chain; degrade to the default voice
 *  (never silent) if no clear match. Accepts an explicit list so callers can
 *  pass the awaited voices from voicesReady(). */
export function pickVoice(voices?: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const list = voices ?? speechSynthesis.getVoices();
  const english = list.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  for (const name of PREFERRED_NAMES) {
    const hit = english.find((v) => v.name.toLowerCase().includes(name));
    if (hit) return hit;
  }
  const male = english.find((v) => /male/i.test(v.name));
  if (male) return male;
  // Last resorts: any US English, any English, then any voice at all.
  return english.find((v) => v.lang.toLowerCase() === 'en-us') ?? english[0] ?? list[0] ?? null;
}

/** Strip markdown and symbols that sound wrong when read aloud. */
export function cleanForSpeech(text: string): string {
  return text
    // pictographic emoji
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    // markdown / structural symbols
    .replace(/[*_#`~|<>[\]{}\\^]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["')\]]?|[^.!?]+$/g) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Speak text sentence-by-sentence. Returns a cancel function synchronously so
 * the caller's cancel pattern is unchanged; voices are awaited internally (iOS
 * loads them async) before selection. onDone fires once after the final
 * sentence (or after cancel).
 */
export function speak(
  text: string,
  { onStart, onDone }: { onStart?: () => void; onDone?: () => void } = {}
): () => void {
  if (typeof speechSynthesis === 'undefined') {
    onDone?.();
    return () => {};
  }
  const sentences = splitSentences(cleanForSpeech(text));
  if (!sentences.length) {
    onDone?.();
    return () => {};
  }

  let cancelled = false;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

  // Voices may not be loaded yet on iOS — wait for them, then speak, unless the
  // caller cancelled (e.g. a newer reply superseded this one) in the meantime.
  voicesReady().then((voices) => {
    if (cancelled) return;
    speechSynthesis.cancel(); // never overlap
    const voice = pickVoice(voices);
    sentences.forEach((sentence, i) => {
      const u = new SpeechSynthesisUtterance(sentence);
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.pitch = 1;
      if (i === 0 && onStart) u.onstart = onStart;
      if (i === sentences.length - 1) {
        u.onend = finish;
        u.onerror = finish;
      }
      speechSynthesis.speak(u);
    });
  });

  return () => {
    cancelled = true;
    speechSynthesis.cancel();
    finish();
  };
}
