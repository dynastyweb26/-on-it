'use client';

// The "What I can do" card (alive layer 08). A LOCAL assistant card: its rows are
// a constant, it is never an event, and it never reaches /api/parse. In the
// assistant's lane (avatar + #FFFDF9 card r18). A row is a tinted icon tile, a
// name, the quoted phrase it will drop into the composer, and a south-west
// arrow: tapping a row is a start, never a send. Pressed row: #F2E6C2, 90ms.
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { AssistantAvatar } from '@/components/chat/EventCard';
import '@/components/alive/alive.css';

export interface CommandRow {
  name: string;
  /** The phrase the row puts in the composer, caret at the end. */
  ex?: string;
  /** A row that opens something instead of filling the composer. */
  action?: 'record-payment';
  icon: IconName;
}

export interface CommandGroup {
  title: string;
  items: CommandRow[];
}

export default function CommandCard({
  groups,
  onPick,
  onAction,
  className = '',
}: {
  groups: CommandGroup[];
  onPick: (phrase: string) => void;
  onAction?: (action: NonNullable<CommandRow['action']>) => void;
  className?: string;
}) {
  return (
    <div className={`al-fade-up ${className}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <AssistantAvatar />
      <div className="al-wcard" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 4px' }}>
          <div className="al-h" style={{ fontSize: 18 }}>What I can do</div>
          <div className="al-td">Tap one to start. Edit it, then send.</div>
        </div>
        {groups.map((group) => (
          <div key={group.title} style={{ padding: '8px 0 2px', borderTop: '1px solid #f3eadb' }}>
            <div className="al-meta" style={{ padding: '0 14px 2px' }}>{group.title}</div>
            {group.items.map((item) => (
              <button
                key={`${group.title}:${item.name}`}
                type="button"
                onClick={() => (item.action ? onAction?.(item.action) : item.ex && onPick(item.ex))}
                className="al-row"
              >
                <div className="al-tile al-tile--30" style={{ background: 'var(--al-gold-soft)', color: 'var(--al-gold-text)' }}>
                  <Icon name={item.icon} size={17} />
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ font: '600 14px var(--font-inter), system-ui', color: 'var(--al-ink)' }}>{item.name}</div>
                  {item.ex && <div style={{ fontSize: 12.5, color: '#7a7166', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>&ldquo;{item.ex}&rdquo;</div>}
                </div>
                {!item.action && <span style={{ color: 'var(--al-faint)', display: 'inline-flex' }}><Icon name="south_west" size={18} /></span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
