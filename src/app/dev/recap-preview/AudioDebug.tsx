'use client';
// TEMPORARY — sound debugging on a phone; removed with /dev/recap-preview.
// AudioDebugPanel: a live readout pinned over everything (the story too) that
// taps pass straight through. AudioDebugControls: "Test beep" (a plain tone
// started inside the tap, bypassing every recap bus) and the audio-session
// type switch.
import { useEffect, useState } from 'react';
import { peekRecapAudio, recapAudio } from '@/lib/recap/audio';

type Session = { type: string };
const session = () => (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { audioSession?: Session }).audioSession);

function browser(ua: string) {
  const ios = ua.match(/OS (\d+)_(\d+)(?:_(\d+))? like Mac OS X/);
  const safari = ua.match(/Version\/([\d.]+).*Safari/);
  const chrome = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/);
  const brave = typeof navigator !== 'undefined' && 'brave' in navigator;
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return [
    ios ? `iOS ${ios[1]}.${ios[2]}${ios[3] ? `.${ios[3]}` : ''}` : null,
    brave ? `Brave (Chromium ${chrome?.[1].split('.')[0]})` : chrome ? `Chrome ${chrome[1].split('.')[0]}` : safari ? `Safari ${safari[1]}` : null,
    standalone ? 'installed PWA' : 'browser tab',
  ].filter(Boolean).join(' · ') || ua;
}

export function AudioDebugPanel({ build }: { build: string }) {
  const [, tick] = useState(0);
  const [hold, setHold] = useState({ peak: 0, at: 0 });
  const [mounted, setMounted] = useState(false);   // navigator-only values: client render only
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => {
      const a = peekRecapAudio();
      const now = performance.now();
      if (a) {
        const p = a.level01();
        setHold((h) => (p >= h.peak || now - h.at > 2000 ? { peak: p, at: now } : h));
      }
      tick((n) => n + 1);
    }, 100);
    return () => clearInterval(id);
  }, []);

  if (!mounted) return null;
  const a = peekRecapAudio();
  const s = session();
  let stored = '—';
  try { stored = localStorage.getItem('onit-recap-muted') ?? 'unset'; } catch { stored = 'blocked'; }
  const ago = a?.dbg.lastCueAt ? `${((performance.now() - a.dbg.lastCueAt) / 1000).toFixed(1)}s ago` : '';
  const db = (v: number) => (v > 0 ? `${(20 * Math.log10(v)).toFixed(0)} dBFS` : 'silence');
  const rows: [string, string][] = [
    ['Device', typeof navigator === 'undefined' ? '' : browser(navigator.userAgent)],
    ['Build', build],
    ['AudioContext', a ? `${a.ctx.state} · ${a.ctx.sampleRate} Hz · t=${a.ctx.currentTime.toFixed(1)}s` : 'not created yet'],
    ['audioSession', s ? `available · type=${s.type}` : 'not available'],
    ['Muted', a ? `${a.isMuted ? 'YES' : 'no'} (stored ${stored})` : `stored ${stored}`],
    ['Music bed', a ? (a.musicOn ? 'on' : 'off') : '—'],
    ['Last cue', a?.dbg.lastCue ? `${a.dbg.lastCue} · ${ago}` : 'none yet'],
    ['Cues', a ? `${a.dbg.played} played · ${a.dbg.skipped} skipped (context not running)` : '—'],
    ['Output', a ? `${db(hold.peak)} peak (2 s hold)` : '—'],
  ];
  return (
    <div
      aria-hidden
      style={{ position: 'fixed', left: 8, right: 8, top: 'calc(env(safe-area-inset-top) + 56px)', zIndex: 200, pointerEvents: 'none', background: 'rgba(0,0,0,.72)', color: '#9f9', font: '11px/1.35 ui-monospace,Menlo,monospace', padding: '6px 8px', borderRadius: 8 }}
    >
      {rows.map(([k, v]) => <div key={k}><span style={{ color: '#ccc' }}>{k}:</span> {v}</div>)}
      <div style={{ height: 4, marginTop: 4, background: '#333', borderRadius: 2 }}>
        <div style={{ height: 4, width: `${Math.min(100, hold.peak * 200)}%`, background: '#9f9', borderRadius: 2 }} />
      </div>
    </div>
  );
}

export function AudioDebugControls() {
  const [, rerender] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const s = mounted ? session() : undefined;
  const chip = (on: boolean) =>
    `min-h-touch rounded-full border px-3 text-sm font-semibold ${on ? 'border-on-background bg-on-background text-background' : 'border-outline-variant bg-surface-container-lowest text-on-background'}`;
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Sound debug (temporary)</div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-outline text-primary" onClick={() => recapAudio()?.testBeep()}>Test beep</button>
        {s && (['ambient', 'auto', 'playback'] as const).map((t) => (
          <button key={t} className={chip(s.type === t)} aria-pressed={s.type === t} onClick={() => { s.type = t; rerender((n) => n + 1); }}>Session: {t}</button>
        ))}
      </div>
    </div>
  );
}
