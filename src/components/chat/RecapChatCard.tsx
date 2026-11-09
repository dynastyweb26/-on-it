'use client';

// The in-chat recap card (alive layer 07, daily + weekly variants), drawn from a
// RecapModel (lib/chat-recap). In the assistant's lane; a #FFFDF9 card r18.
//   daily   meta · title (Montserrat 17) · 2x2 tiles (Money in / Owed to you /
//           Overdue / Signed estimates) · "Open Books >"
//   weekly  meta · title · seven bars (the peak day in gold) · Owed / Overdue /
//           Signed
import Icon from '@/components/Icon';
import { AssistantAvatar } from '@/components/chat/EventCard';
import { money } from '@/lib/financials';
import type { RecapModel } from '@/lib/chat-recap';
import '@/components/alive/alive.css';

const label = { fontSize: 12, color: 'var(--al-mute)' } as const;
const whole = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export default function RecapChatCard({ model, onOpenBooks, className = '' }: {
  model: RecapModel;
  onOpenBooks: () => void;
  className?: string;
}) {
  return (
    <div className={`al-fade-up ${className}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <AssistantAvatar />
      <div className="al-wcard" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 10px' }}>
          <div className="al-meta">{model.metaLabel}</div>
          <div className="al-h" style={{ fontSize: 17, marginTop: 6 }}>{model.title}</div>
        </div>

        {model.kind === 'daily' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--al-hair)' }}>
              <div style={{ padding: '12px 14px', borderRight: '1px solid var(--al-hair)', borderBottom: '1px solid var(--al-hair)' }}>
                <div style={label}>Money in</div>
                <div className="al-h" style={{ fontSize: 22, color: 'var(--al-gold-num)' }}>{money(model.moneyIn)}</div>
              </div>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--al-hair)' }}>
                <div style={label}>Owed to you</div>
                <div className="al-h" style={{ fontSize: 22 }}>{money(model.owed)}</div>
              </div>
              <div style={{ padding: '12px 14px', borderRight: '1px solid var(--al-hair)' }}>
                <div style={label}>Overdue</div>
                <div className="al-h" style={{ fontSize: 22, color: model.overdue > 0 ? 'var(--al-rust)' : undefined }}>{model.overdue}</div>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={label}>Signed estimates</div>
                <div className="al-h" style={{ fontSize: 22 }}>{model.signed}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenBooks}
              className="al-press"
              style={{ width: '100%', padding: '10px 14px', borderTop: '1px solid var(--al-hair)', borderLeft: 0, borderRight: 0, borderBottom: 0, background: 'transparent', font: '600 13.5px var(--font-inter), system-ui', color: 'var(--al-gold-link)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              Open Books<Icon name="chevron_right" size={18} />
            </button>
          </>
        ) : (
          <>
            {model.bars && (
              <div role="img" aria-label="Money in by day, Monday to Sunday" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56, padding: '0 14px 10px' }}>
                {model.bars.map((b, i) => (
                  <div key={i} style={{ flex: 1, height: `${b.pct}%`, background: b.best ? 'var(--al-gold)' : 'var(--al-bar)', borderRadius: 4, minHeight: b.pct > 0 ? undefined : 0 }} />
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: '1px solid var(--al-hair)', fontSize: 12, color: 'var(--al-mute)' }}>
              <div style={{ padding: '10px 14px', borderRight: '1px solid var(--al-hair)' }}>Owed<div className="al-h" style={{ fontSize: 16, color: 'var(--al-ink)' }}>{whole(model.owed)}</div></div>
              <div style={{ padding: '10px 14px', borderRight: '1px solid var(--al-hair)' }}>Overdue<div className="al-h" style={{ fontSize: 16, color: model.overdue > 0 ? 'var(--al-rust)' : 'var(--al-ink)' }}>{model.overdue}</div></div>
              <div style={{ padding: '10px 14px' }}>Signed<div className="al-h" style={{ fontSize: 16, color: 'var(--al-ink)' }}>{model.signed}</div></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
