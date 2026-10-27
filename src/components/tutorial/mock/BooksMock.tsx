import Icon from '@/components/Icon';
import type { SceneState } from '../player-state';
import styles from '../tutorial.module.css';
import { MockChrome } from './MockChrome';

// Ported 1:1 from On It Tutorials.html — screen `books`.

const dot = (color: string) => (
  <span style={{ width: 9, height: 9, borderRadius: 5, background: color }} />
);

// The laptop screen's dots are the design's 8x8 (radius 4), not the phone's 9x9.
const laptopDot = (color: string) => (
  <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
);

// ─── Laptop (xl) ────────────────────────────────────────────────────────────
// The design's laptop Books screen: a 1088 column (its own max-width, so it is
// the content area minus the 32px side padding on a 1380 stage), the Net card
// beside the tiles, then the expenses list beside the Recaps card. Values are the
// export's (design/laptop/tutorial.html, MAPPING §13).
function LaptopBooks({ state }: { state: SceneState }) {
  const { st, netI, netD, owedI, owedD, collI, collD, spentI, spentD } = state;
  return (
    <div
      className={styles.aScrIn}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        padding: '24px 32px 0',
      }}
    >
      <div style={{ width: '100%', maxWidth: 1088, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ font: '700 24px/1 var(--font-montserrat)', marginRight: 'auto' }}>Books</span>
          <span
            style={{
              height: 40, padding: '0 16px', borderRadius: 999, background: '#f5eddf',
              border: '1.5px solid #d0c5af', boxSizing: 'border-box', display: 'flex',
              alignItems: 'center', gap: 8, font: '600 15px/1 var(--font-inter)',
            }}
          >
            <Icon name="description" size={20} />
            Income &amp; Expenses
          </span>
          <span
            data-spot="addExpense"
            style={{
              height: 40, padding: '0 18px', borderRadius: 999, background: '#d4af37',
              display: 'flex', alignItems: 'center', gap: 8, font: '700 15px/1 var(--font-inter)',
            }}
          >
            <Icon name="add" size={22} />
            Add expense
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 16 }}>
          <div
            data-spot="net"
            style={{
              position: 'relative', padding: '26px 28px', borderRadius: 20, background: '#343027',
              color: '#fff8f0', display: 'flex', flexDirection: 'column',
              justifyContent: 'flex-end', minHeight: 180, boxSizing: 'border-box',
            }}
          >
            <div style={{ font: '600 13px/1 var(--font-inter)', letterSpacing: '.05em', color: '#e9c349' }}>
              NET · ALL TIME
            </div>
            <div
              style={{
                marginTop: 12, font: '800 48px/1 var(--font-montserrat)', letterSpacing: '-.01em',
                fontVariantNumeric: 'tabular-nums', color: '#e9c349',
              }}
            >
              {netI}
              <span style={{ fontSize: 26 }}>{netD}</span>
            </div>
            <div style={{ marginTop: 10, font: '400 14px/1 var(--font-inter)', color: '#d0c5af' }}>
              12 invoices
            </div>
            <span style={{ position: 'absolute', right: 22, top: 22, color: '#d0c5af', display: 'flex' }}>
              <Icon name="chevron_right" size={24} />
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr auto', gap: 12 }}>
            <div
              data-spot="owed"
              style={{ padding: '16px 18px', borderRadius: 20, background: '#fff', border: '1.5px solid #f3e9c8' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '600 14px/1 var(--font-inter)' }}>
                {laptopDot('#d4af37')}
                Still owed
                <span style={{ marginLeft: 'auto', color: '#7f7663', display: 'flex' }}>
                  <Icon name="chevron_right" size={18} />
                </span>
              </div>
              <div
                style={{
                  marginTop: 16, font: '800 28px/1 var(--font-montserrat)', fontVariantNumeric: 'tabular-nums',
                }}
              >
                {owedI}
                <span style={{ fontSize: 16, color: '#4d4635' }}>{owedD}</span>
              </div>
            </div>
            <div
              data-spot="coll"
              style={{ padding: '16px 18px', borderRadius: 20, background: '#fff', border: '1.5px solid #efe4d2' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '600 14px/1 var(--font-inter)' }}>
                {laptopDot('#0f6d31')}
                Collected
                <span style={{ marginLeft: 'auto', color: '#7f7663', display: 'flex' }}>
                  <Icon name="chevron_right" size={18} />
                </span>
              </div>
              <div
                style={{
                  marginTop: 16, font: '800 28px/1 var(--font-montserrat)', fontVariantNumeric: 'tabular-nums',
                }}
              >
                {collI}
                <span style={{ fontSize: 16, color: '#4d4635' }}>{collD}</span>
              </div>
            </div>
            <div
              data-spot="spent"
              style={{
                gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 10, height: 52,
                padding: '0 18px', borderRadius: 20, background: '#fff', border: '1.5px solid #efe4d2',
              }}
            >
              {laptopDot('#7f7663')}
              <span style={{ font: '600 15px/1 var(--font-inter)' }}>Spent</span>
              <span
                style={{
                  marginLeft: 'auto', font: '800 20px/1 var(--font-montserrat)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {spentI}
                <span style={{ fontSize: 13, color: '#4d4635' }}>{spentD}</span>
              </span>
              <span style={{ color: '#4d4635', display: 'flex' }}>
                <Icon name="chevron_right" size={20} />
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div style={{ borderRadius: 20, background: '#fff', border: '1.5px solid #efe4d2', overflow: 'hidden' }}>
            <div
              data-spot="viewExpenses"
              className={styles.rowHover}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, height: 64, padding: '0 18px',
                borderBottom: '1px solid #f0e7d8',
              }}
            >
              <span
                style={{
                  width: 40, height: 40, borderRadius: 12, background: '#f5eddf',
                  display: 'grid', placeItems: 'center',
                }}
              >
                <Icon name="receipt_long" size={22} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 16px/1.2 var(--font-inter)' }}>View expenses</div>
                <div style={{ font: '400 13.5px/1.3 var(--font-inter)', color: '#4d4635' }}>
                  Newest first, by week
                </div>
              </div>
              <span style={{ font: '500 15px/1 var(--font-inter)' }}>18</span>
              <span style={{ color: '#4d4635', display: 'flex' }}>
                <Icon name="chevron_right" size={20} />
              </span>
            </div>
            <div
              data-spot="recurring"
              className={styles.rowHover}
              style={{ display: 'flex', alignItems: 'center', gap: 14, height: 64, padding: '0 18px' }}
            >
              <span
                style={{
                  width: 40, height: 40, borderRadius: 12, background: '#f0e3b8',
                  display: 'grid', placeItems: 'center',
                }}
              >
                <Icon name="autorenew" size={22} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 16px/1.2 var(--font-inter)' }}>Recurring expenses</div>
                <div style={{ font: '400 13.5px/1.3 var(--font-inter)', color: '#4d4635' }}>
                  1 charge · next Nov 25
                </div>
              </div>
              <span style={{ font: '700 15px/1 var(--font-inter)' }}>
                $40.00
                <span style={{ fontWeight: 400, fontSize: 13, color: '#4d4635' }}>/mo</span>
              </span>
              <span style={{ color: '#4d4635', display: 'flex' }}>
                <Icon name="chevron_right" size={20} />
              </span>
            </div>
          </div>

          <div
            data-spot="recaps"
            style={{
              padding: 18, borderRadius: 20, background: '#fff', border: '1.5px solid #efe4d2',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className={st.sparkle ? styles.aTwinkle : undefined}
                style={{ color: '#735c00', display: 'flex' }}
              >
                <Icon name="auto_awesome" size={24} />
              </span>
              <span style={{ font: '600 17px/1 var(--font-inter)' }}>Recaps</span>
              <span style={{ marginLeft: 'auto', color: '#4d4635', display: 'flex' }}>
                <Icon name="chevron_right" size={20} />
              </span>
            </div>
            <span
              data-spot="watchAgain"
              style={{
                alignSelf: 'flex-start', height: 36, padding: '0 14px 0 10px', borderRadius: 999,
                background: '#f5eddf', display: 'flex', alignItems: 'center', gap: 4,
                font: '600 14px/1 var(--font-inter)',
              }}
            >
              <Icon name="play_arrow" size={22} filled />
              Watch again
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BooksMock({
  state,
  nudge = 0,
  laptop = false,
}: {
  state: SceneState;
  nudge?: number;
  laptop?: boolean;
}) {
  const { st, netI, netD, owedI, owedD, collI, collD, spentI, spentD } = state;
  if (laptop) {
    // The overlay already wraps the mock in LaptopShell (288 sidebar, content area).
    return (
      <div aria-hidden className={styles.mockProtoScope}>
        <LaptopBooks state={state} />
      </div>
    );
  }
  return (
    <div aria-hidden className={styles.mockProtoScope}>
      <MockChrome hdrChat={false} hdrBack={false} tabNow="books">
        <div
          data-tut-scroll-area
          className={styles.aScrIn}
          style={{
            position: 'absolute',
            top: 103,
            left: 0,
            right: 0,
            bottom: 84,
            overflow: 'hidden',
            padding: '14px 16px 0',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            data-tut-scroll-content
            data-tut-base={0}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              transform: `translateY(${nudge}px)`,
              transition: 'transform .5s cubic-bezier(.65,0,.35,1)',
            }}
          >
          <div
            data-spot="recaps"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              height: 50,
              padding: '0 16px',
              borderRadius: 20,
              background: '#fff',
              border: '1.5px solid #E6DCCB',
            }}
          >
            <span
              className={st.sparkle ? styles.aTwinkle : undefined}
              style={{ color: '#B8960F', display: 'flex' }}
            >
              <Icon name="auto_awesome" size={26} />
            </span>
            <span style={{ font: '600 18px/1 var(--font-inter)' }}>Recaps</span>
            <span
              data-spot="watchAgain"
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                font: '400 15px/1 var(--font-inter)',
                color: '#3E3830',
                borderRadius: 10,
                padding: 4,
              }}
            >
              Watch again
              <span style={{ color: '#4A443A', display: 'flex' }}>
                <Icon name="play_arrow" size={24} filled />
              </span>
            </span>
            <span style={{ color: '#4A443A', display: 'flex' }}>
              <Icon name="chevron_right" size={22} />
            </span>
          </div>

          <div
            data-spot="net"
            style={{
              position: 'relative',
              padding: '18px 20px',
              borderRadius: 26,
              background: '#36312A',
              color: '#FFF8EC',
            }}
          >
            <div
              style={{
                font: '800 44px/1 var(--font-montserrat)',
                letterSpacing: '-.01em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {netI}
              <span style={{ fontSize: 24, color: '#CFC6B5' }}>{netD}</span>
            </div>
            <div
              style={{
                marginTop: 8,
                font: '600 15px/1 var(--font-inter)',
                letterSpacing: '.03em',
                color: '#CFC6B5',
              }}
            >
              Net · all time <span style={{ fontWeight: 400, color: '#A59C8C' }}>· 12 invoices</span>
            </div>
            <span
              style={{
                position: 'absolute',
                right: 18,
                top: 34,
                color: '#CFC6B5',
                display: 'flex',
              }}
            >
              <Icon name="chevron_right" size={24} />
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div
              data-spot="owed"
              style={{
                padding: '14px 16px',
                borderRadius: 20,
                background: '#fff',
                border: '1.5px solid #EBDDB0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '600 15px/1 var(--font-inter)' }}>
                {dot('#D4AF37')}
                Still owed
                <span style={{ marginLeft: 'auto', color: '#8D8576', display: 'flex' }}>
                  <Icon name="chevron_right" size={18} />
                </span>
              </div>
              <div
                style={{
                  marginTop: 12,
                  font: '800 24px/1 var(--font-montserrat)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {owedI}
                <span style={{ fontSize: 15, color: '#6B6458' }}>{owedD}</span>
              </div>
            </div>
            <div
              data-spot="coll"
              style={{
                padding: '14px 16px',
                borderRadius: 20,
                background: '#fff',
                border: '1.5px solid #E6DCCB',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '600 15px/1 var(--font-inter)' }}>
                {dot('#1E7A3C')}
                Collected
                <span style={{ marginLeft: 'auto', color: '#8D8576', display: 'flex' }}>
                  <Icon name="chevron_right" size={18} />
                </span>
              </div>
              <div
                style={{
                  marginTop: 12,
                  font: '800 24px/1 var(--font-montserrat)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {collI}
                <span style={{ fontSize: 15, color: '#6B6458' }}>{collD}</span>
              </div>
            </div>
          </div>

          <div
            data-spot="spent"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: 52,
              padding: '0 16px',
              borderRadius: 20,
              background: '#fff',
              border: '1.5px solid #E6DCCB',
            }}
          >
            {dot('#8D8576')}
            <span style={{ font: '500 17px/1 var(--font-inter)' }}>Spent</span>
            <span
              style={{
                marginLeft: 'auto',
                font: '800 18px/1 var(--font-montserrat)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {spentI}
              <span style={{ fontSize: 13, color: '#6B6458' }}>{spentD}</span>
            </span>
            <span style={{ color: '#4A443A', display: 'flex' }}>
              <Icon name="chevron_right" size={20} />
            </span>
          </div>

          <div
            data-spot="addExpense"
            style={{
              height: 54,
              borderRadius: 27,
              background: '#D4AF37',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              font: '700 18px/1 var(--font-inter)',
              color: '#2A2410',
            }}
          >
            <Icon name="add" size={26} />
            Add expense
          </div>

          <div
            style={{
              height: 52,
              borderRadius: 26,
              background: '#F3EBDD',
              border: '1.5px solid #DCD2C0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              font: '600 17px/1 var(--font-inter)',
            }}
          >
            <Icon name="description" size={22} />
            Income &amp; Expenses
          </div>

          <div
            style={{
              marginTop: 4,
              borderRadius: 22,
              background: '#fff',
              border: '1.5px solid #E6DCCB',
              overflow: 'hidden',
            }}
          >
            <div
              data-spot="viewExpenses"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px',
                borderBottom: '1px solid #EEE6D8',
              }}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: '#F1EADF',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon name="receipt_long" size={24} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 17px/1.2 var(--font-inter)' }}>View expenses</div>
                <div style={{ font: '400 14px/1.3 var(--font-inter)', color: '#4A443A' }}>
                  Newest first, by week
                </div>
              </div>
              <span style={{ font: '500 16px/1 var(--font-inter)', color: '#3E3830' }}>18</span>
              <span style={{ color: '#4A443A', display: 'flex' }}>
                <Icon name="chevron_right" size={20} />
              </span>
            </div>
            <div
              data-spot="recurring"
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px' }}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: '#F2E5BC',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon name="autorenew" size={24} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 17px/1.2 var(--font-inter)' }}>Recurring expenses</div>
                <div style={{ font: '400 14px/1.3 var(--font-inter)', color: '#4A443A' }}>
                  1 charge · next Nov 25
                </div>
              </div>
              <span style={{ font: '700 16px/1 var(--font-inter)' }}>
                $40.00
                <span style={{ fontWeight: 400, fontSize: 13, color: '#4A443A' }}>/mo</span>
              </span>
              <span style={{ color: '#4A443A', display: 'flex' }}>
                <Icon name="chevron_right" size={20} />
              </span>
            </div>
          </div>
          </div>
        </div>
      </MockChrome>
    </div>
  );
}
