'use client';
// 02 AI meter — design/tiers/Tiers_1_Paywall_and_AI.dc.html §02.
// One quiet line, the last row of the thread, centered above the input bar.
// Shows at 3 or fewer left (lib/ai-meter-view decides), gold at 1 left, fades
// out at 0 where the limit card takes over. The host only hands it a new
// count after an answer has finished streaming, so the number never moves
// mid-answer.
import { useEffect, useState } from 'react';
import type { AiMeter as AiMeterNumbers } from '@/lib/ai-limit';
import { meterLine, type MeterLine } from '@/lib/ai-meter-view';
import './ai-tiers.css';

const LEAVE_MS = 280;

export default function AiMeter({ meter }: { meter: AiMeterNumbers | null }) {
  // Re-check at the owner's local midnight: the count starts over and the line goes.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!meter) return;
    const wait = Date.parse(meter.resetsAt) - Date.now();
    if (!Number.isFinite(wait) || wait <= 0 || wait > 2 ** 31 - 1) return;
    const t = setTimeout(() => setTick((n) => n + 1), wait + 50);
    return () => clearTimeout(t);
  }, [meter]);

  const line = meterLine(meter, new Date());
  const [shown, setShown] = useState<MeterLine | null>(line);
  const [leaving, setLeaving] = useState(false);
  const key = line?.text ?? null;

  useEffect(() => {
    if (line) {
      setShown(line);
      setLeaving(false);
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => { setShown(null); setLeaving(false); }, LEAVE_MS);
    return () => clearTimeout(t);
    // Keyed on the text: a new object with the same numbers changes nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <>
      {/* Always mounted, so a change is announced once ("2 questions left today"). */}
      <span className="aim-sr" role="status" aria-live="polite">{line?.announce ?? ''}</span>
      {shown && (
        <div className={`aim-row ${leaving ? 'aim-leave' : 'aim-enter'}`} data-ai-meter="" aria-hidden="true">
          <span className={`aim-line${shown.last ? ' is-last' : ''}`}>
            <span className="material-symbols-outlined">forum</span>
            <span key={shown.text} className="aim-count">{shown.text}</span>
          </span>
        </div>
      )}
    </>
  );
}
