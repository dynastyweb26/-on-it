'use client';
// Recap sound (RECAP-SPEC §6) — PLACEHOLDER synthesis, ported from the
// prototype's audio.js. Every sound is a simple synthesized stand-in under the
// cue sheet's name; the licensed set swaps in later as decoded AudioBuffers
// played by `play(name)` — nothing else changes.
//
// Web Audio only (no <audio> elements), and the page's audio session is set to
// 'ambient' before the first sound, so on iPhone the silent switch silences
// it and it mixes with whatever else is playing instead of stopping it
// (navigator.audioSession, Safari 16.4+; older browsers just ignore it).
//
// iOS only lets an AudioContext start inside a user gesture. The story opens
// from a tap, but it mounts after that tap's handler returns, so whatever
// opens it calls primeRecapAudio() synchronously in its click handler; the
// story then starts the music bed right away. If nothing primed it, the story
// starts sound on its first tap instead.
//
// Bus: out (mute) ← fx (cues) + musicBus ← duckNode ← lowpass 1400 Hz ← voices.
//
// Levels (2026-10-03, after the iPhone check: the prototype's levels were far
// too quiet on a phone speaker). Measured offline (OfflineAudioContext), not
// guessed: the bed's average sits at `music.db` dBFS (−24), and every cue
// peaks between −10 and −6 dBFS — the cue sheet's dB (−28 … −10) maps onto
// that window in order, so ticks are the softest and the snap the loudest.
// Fixed alongside: every note started with a one-sample click (see env()). The licensed set gets re-measured the same way.
import { RECAP_CONFIG } from '@/lib/recap/config';

const dbToGain = (db: number) => Math.pow(10, db / 20);
/** The bed's RMS (dBFS) with the music bus at gain 1 (measured, 12-bar loop). */
const BED_RMS_AT_UNITY = -30.6;
/** Each sound's peak (dBFS) at gain 1 (measured; the noise is seeded, so these are exact). */
const PEAK_AT_UNITY: Record<string, number> = {
  whoosh: -9.4, sweep: -10.7, chime: -2.2, tick: -9.7, drop: -6.2, flutter: -2.0,
  stamp: -2.3, ripple: -20.5, snap: 3.1, glint: -6.7,
};
/** Cue-sheet dB (−28 … −10) → target peak dBFS (−10 … −6), order kept. */
export const cuePeak = (db: number) => -10 + (Math.min(-10, Math.max(-28, db)) + 28) / 18 * 4;
// Fmaj7 · Em7 · Dm7 · Cmaj7, 3 bars each.
const CHORDS = [[174.6, 220, 261.6, 329.6], [164.8, 196, 246.9, 293.7], [146.8, 174.6, 220, 261.6], [130.8, 164.8, 196, 246.9]];
type Music = typeof RECAP_CONFIG.sound.music;

export class RecapAudio {
  readonly ctx: AudioContext;
  private out: GainNode;
  private fx: GainNode;
  private musicBus: GainNode;
  private duckNode: GainNode;
  private lp: BiquadFilterNode;
  private noise: AudioBuffer;
  private cfg: Music = RECAP_CONFIG.sound.music;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextT = 0;
  private beat = 0;
  musicOn = false;
  private musicPaused = false;
  private muted = false;
  // TEMPORARY debug (dev preview readout) — remove with /dev/recap-preview.
  dbg = { lastCue: '', lastCueAt: 0, played: 0, skipped: 0 };
  private meter: AnalyserNode;
  private meterBuf = new Float32Array(1024);

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const c = ctx;
    // out → meter (pass-through analyser, debug) → destination
    this.meter = c.createAnalyser(); this.meter.fftSize = 1024; this.meter.connect(c.destination);
    this.out = c.createGain(); this.out.connect(this.meter);
    this.fx = c.createGain(); this.fx.connect(this.out);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.out);
    this.duckNode = c.createGain(); this.duckNode.connect(this.musicBus);
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 1400; this.lp.connect(this.duckNode);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, len);
    const ch = this.noise.getChannelData(0);
    // Seeded (mulberry32), so the noise cues peak the same every session and
    // match their measured PEAK_AT_UNITY.
    let seed = 0x0f1e2d3c;
    for (let i = 0; i < len; i++) {
      seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), seed | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      ch[i] = (((r ^ (r >>> 14)) >>> 0) / 4294967296) * 2 - 1;
    }
  }

  get running() { return this.ctx.state === 'running'; }
  get isMuted() { return this.muted; }
  /** Peak level leaving the recap bus right now (0–1; debug). */
  level01() {
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let m = 0;
    for (const v of this.meterBuf) m = Math.max(m, Math.abs(v));
    return m;
  }
  /** A plain 440 Hz beep straight to the speakers, bypassing every recap bus (debug). */
  testBeep() {
    this.resume();
    const t = this.ctx.currentTime + 0.01, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = 440; g.gain.setValueAtTime(0.4, t); g.gain.setTargetAtTime(0, t + 0.35, 0.03);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 0.6);
  }
  resume() { if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {}); }
  /** Silences everything; the bed also stops scheduling notes while muted (no work at zero volume). */
  setMuted(m: boolean) { this.muted = m; this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03); }
  private level() { return dbToGain(this.cfg.db - BED_RMS_AT_UNITY); }

  startMusic() {
    if (this.musicOn) return;
    this.musicOn = true; this.musicPaused = false;
    const t = this.ctx.currentTime, g = this.musicBus.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(this.level(), t + this.cfg.fadeIn / 1000);
    this.nextT = t + 0.08; this.beat = 0;
    clearInterval(this.timer); this.timer = setInterval(() => this.schedule(), 100);
  }
  stopMusic() {
    if (!this.musicOn) return;
    this.musicOn = false;
    const t = this.ctx.currentTime, g = this.musicBus.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + this.cfg.fadeOut / 1000);
    setTimeout(() => { if (!this.musicOn) clearInterval(this.timer); }, this.cfg.fadeOut + 50);
  }
  pauseMusic(p: boolean) {
    if (!this.musicOn || this.musicPaused === p) return;
    this.musicPaused = p;
    this.musicBus.gain.setTargetAtTime(p ? 0 : this.level(), this.ctx.currentTime, 0.08);
  }

  private schedule() {
    const spb = 60 / this.cfg.bpm, beats = this.cfg.bars * 4;
    while (this.nextT < this.ctx.currentTime + 0.5) {
      if (!this.musicPaused && !this.muted) this.playBeat(this.beat, this.nextT, spb);
      this.nextT += spb; this.beat = (this.beat + 1) % beats;
    }
  }
  private playBeat(b: number, t: number, spb: number) {
    const bar = Math.floor(b / 4), pos = b % 4, chord = CHORDS[Math.floor(bar / 3) % 4];
    if (pos === 0) chord.forEach((f, i) => this.tone('triangle', f, t + i * 0.012, 0.05, 0.05, spb * 3.6, this.lp));
    if (pos === 2) chord.slice(1).forEach((f) => this.tone('sine', f * 2, t + spb * 0.5, 0.01, 0.018, spb * 1.2, this.lp));
    if (pos === 0 || pos === 2) {
      this.tone('sine', chord[0] / 2, t, 0.01, 0.12, spb * 1.6, this.lp);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      this.env(g, t, 0.004, 0.22, 0.18); o.connect(g); g.connect(this.duckNode); o.start(t); o.stop(t + 0.3);
    }
    if (pos === 1 || pos === 3) this.noiseHit(t, 0.07, 0.035, 'bandpass', 2400, 1800, 1.2, this.duckNode);
    this.noiseHit(t + spb / 2, 0.03, 0.012, 'highpass', 7000, 6000, 0.7, this.duckNode);
  }
  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    // Silent until the envelope starts: a source can start a sample before the
    // gain's first event, and the default gain of 1 let that sample through at
    // full scale (a click on every note, up to −0.5 dBFS on the bed).
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  private tone(type: OscillatorType, f: number, t: number, a: number, peak: number, dec: number, dest: AudioNode = this.fx) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f; this.env(g, t, a, peak, dec);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dec + 0.05);
  }
  private noiseHit(t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number, q = 1, dest: AudioNode = this.fx) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain(); this.env(g, t, dur * 0.35, peak, dur * 0.65);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.05);
  }
  private duck() {
    const t = this.ctx.currentTime, g = this.duckNode.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(dbToGain(this.cfg.duckDb), t + 0.05);
    g.linearRampToValueAtTime(1, t + this.cfg.duckMs / 1000);
  }

  /** A cue-sheet sound at `db`. ('none' = the silent start marker of a tick run.) */
  play(name: string, db = -14) {
    if (name !== 'none') { this.dbg.lastCue = `${name} ${db} dB`; this.dbg.lastCueAt = performance.now(); }
    if (!this.running) { this.dbg.skipped++; return; }
    if (name !== 'none') this.dbg.played++;
    const t = this.ctx.currentTime + 0.01, a = dbToGain(cuePeak(db) - (PEAK_AT_UNITY[name] ?? 0));
    switch (name) {
      case 'whoosh': this.noiseHit(t, 0.45, a * 0.9, 'bandpass', 300, 2600, 0.8); break;
      case 'sweep': this.noiseHit(t, 1.2, a * 0.7, 'bandpass', 220, 3200, 0.6); break;
      case 'tick': this.tone('square', 2600, t, 0.002, a * 0.35, 0.018); break;
      case 'chime': this.duck(); [523.25, 783.99, 1046.5].forEach((f, i) => this.tone('sine', f, t + i * 0.012, 0.01, a * (0.45 - i * 0.12), 1.4)); this.tone('triangle', 261.6, t, 0.01, a * 0.2, 0.9); break;
      case 'drop': this.tone('sine', 880, t, 0.005, a * 0.5, 0.12); this.tone('sine', 660, t + 0.04, 0.005, a * 0.3, 0.12); break;
      case 'flutter': this.noiseHit(t, 0.28, a * 0.6, 'highpass', 3000, 1800, 0.5); break;
      case 'stamp': this.tone('sine', 110, t, 0.004, a * 0.9, 0.14); this.noiseHit(t, 0.06, a * 0.35, 'lowpass', 1800, 600); break;
      case 'ripple': for (let i = 0; i < 6; i++) this.noiseHit(t + i * 0.04, 0.05, a * 0.4, 'lowpass', 1600, 700); break;
      case 'snap': this.duck(); this.noiseHit(t, 0.05, a * 0.9, 'highpass', 2200, 1400, 0.7); this.tone('sine', 150, t, 0.003, a * 0.8, 0.12); this.tone('triangle', 82, t + 0.01, 0.004, a * 0.45, 0.2); break;
      case 'glint': [1567.98, 2093].forEach((f, i) => this.tone('sine', f, t + i * 0.06, 0.005, a * 0.3, 0.6)); break;
      default: break;
    }
  }
}

let shared: RecapAudio | null = null;

/** The one RecapAudio for the page (created on first use, kept across opens). */
export function recapAudio(): RecapAudio | null {
  if (shared) return shared;
  if (typeof window === 'undefined') return null;
  try {
    // Ambient: the silent switch mutes it and it mixes with other audio (§6).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    shared = new RecapAudio(new AC());
  } catch {
    shared = null;
  }
  return shared;
}

/** The instance if one exists, without creating it (debug readout). */
export function peekRecapAudio(): RecapAudio | null { return shared; }

/** Call synchronously inside the tap that opens a recap (iOS gesture rule). */
export function primeRecapAudio() {
  recapAudio()?.resume();
}
