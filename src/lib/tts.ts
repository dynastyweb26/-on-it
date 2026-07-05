// ═══ ON IT — Voice-mode TTS ═══
// Only voice mode speaks. Text mode is always silent.
// Quality tuning: male English voice, rate ~0.95, sentence-by-sentence
// queueing so periods and commas produce real pauses.

const PREFERRED_NAMES = ['aaron', 'daniel', 'alex', 'google us english'];

export function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices();
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  for (const name of PREFERRED_NAMES) {
    const hit = english.find((v) => v.name.toLowerCase().includes(name));
    if (hit) return hit;
  }
  const male = english.find((v) => /male/i.test(v.name));
  if (male) return male;
  return english.find((v) => v.lang.toLowerCase() === 'en-us') ?? english[0] ?? null;
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
 * Speak text sentence-by-sentence. Returns a cancel function.
 * onDone fires once after the final sentence (or after cancel).
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

  speechSynthesis.cancel(); // never overlap
  const voice = pickVoice();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

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

  return () => {
    speechSynthesis.cancel();
    finish();
  };
}
