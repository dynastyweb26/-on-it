import Icon from '@/components/Icon';
import type { SceneState } from '../player-state';
import styles from '../tutorial.module.css';
import { MockChrome } from './MockChrome';
import { DrawIcon } from './icons';

// Ported 1:1 from On It Tutorials.html — screens invList, invDetail, estDetail.
// Every inline style, size, copy string and animation delay is the prototype's.

const MONO = 'var(--font-plex-mono), monospace';

function MonthChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        alignSelf: 'flex-start',
        padding: '8px 14px',
        borderRadius: 16,
        background: '#F2E5BC',
        font: '800 13px/1 var(--font-montserrat)',
        letterSpacing: '.1em',
        color: '#3E3200',
      }}
    >
      {children}
    </span>
  );
}

function FilterPill({ label, count, on }: { label: string; count: string; on: boolean }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 44,
        padding: '0 10px 0 16px',
        borderRadius: 12,
        border: on ? '2px solid #D4AF37' : '1.5px solid #DCD2C0',
        background: on ? '#F4E8C4' : '#fff',
        font: '600 17px/1 var(--font-inter)',
      }}
    >
      {label}
      <span
        style={{
          minWidth: 28,
          height: 26,
          borderRadius: 13,
          background: on ? '#fff' : '#F1EADF',
          display: 'grid',
          placeItems: 'center',
          font: '700 13px/1 var(--font-inter)',
        }}
      >
        {count}
      </span>
    </span>
  );
}

// The prototype's list card: title, meta line, amount, optional badge, chevron disc.
function DocCard({
  spot,
  meta,
  amount,
  badge,
  anim,
}: {
  spot?: string;
  meta: string;
  amount: string;
  badge?: { icon: 'send' | 'history'; text: string; bg: string; color: string; spot?: string };
  anim: string;
}) {
  return (
    <div
      data-spot={spot}
      className={anim}
      style={{
        position: 'relative',
        padding: '16px 18px',
        borderRadius: 22,
        background: '#FAF2E6',
        border: '1.5px solid #E8DECD',
      }}
    >
      <div style={{ font: '800 20px/1.2 var(--font-montserrat)' }}>Brandon</div>
      <div style={{ marginTop: 4, font: '400 14.5px/1 var(--font-inter)', color: '#6B6458' }}>{meta}</div>
      <div style={{ marginTop: 10, font: '800 28px/1 var(--font-montserrat)' }}>{amount}</div>
      {badge && (
        <span
          data-spot={badge.spot}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 9,
            background: badge.bg,
            font: '800 12px/1 var(--font-inter)',
            letterSpacing: '.07em',
            color: badge.color,
          }}
        >
          <Icon name={badge.icon} size={16} />
          {badge.text}
        </span>
      )}
      <span
        style={{
          position: 'absolute',
          right: 16,
          bottom: 14,
          width: 42,
          height: 42,
          borderRadius: 21,
          background: '#EFE7DA',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="chevron_right" size={22} />
      </span>
    </div>
  );
}

function StatusTabs({ left, summary }: { left: React.ReactNode; summary: React.ReactNode }) {
  return (
    <div
      data-spot="statusTabs"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 14 }}
    >
      <div style={{ display: 'flex', gap: 10 }}>{left}</div>
      {summary}
    </div>
  );
}

// ─── invList ────────────────────────────────────────────────────────────────
function InvoiceList({ state }: { state: SceneState }) {
  const { seg, openTotal } = state;
  return (
    <div
      className={styles.aScrIn}
      style={{
        position: 'absolute',
        top: 103,
        left: 0,
        right: 0,
        bottom: 84,
        overflow: 'hidden',
        padding: '16px 16px 0',
        boxSizing: 'border-box',
      }}
    >
      <div
        data-spot="segToggle"
        style={{
          position: 'relative',
          height: 56,
          borderRadius: 28,
          background: '#F3EBDD',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 5,
            bottom: 5,
            left: seg === 'est' ? '50%' : '5px',
            width: 'calc(50% - 5px)',
            borderRadius: 23,
            background: '#D4AF37',
            boxShadow: '0 6px 16px -8px rgba(120,90,10,.5)',
            transition: 'left .5s cubic-bezier(.65,0,.35,1)',
          }}
        />
        <span
          data-spot="segInv"
          style={{
            position: 'relative',
            display: 'grid',
            placeItems: 'center',
            font: '600 16.5px/1 var(--font-inter)',
            color: '#2A2410',
          }}
        >
          Invoices
        </span>
        <span
          data-spot="segEst"
          style={{
            position: 'relative',
            display: 'grid',
            placeItems: 'center',
            font: '600 16.5px/1 var(--font-inter)',
            color: '#2A2410',
          }}
        >
          Estimates
        </span>
      </div>

      {seg !== 'est' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <StatusTabs
            left={
              <>
                <FilterPill label="Open" count="3" on />
                <FilterPill label="Paid" count="1" on={false} />
              </>
            }
            summary={
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  font: '400 14.5px/1 var(--font-inter)',
                  color: '#4A443A',
                }}
              >
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>3 open · {openTotal}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="schedule" size={18} />
                  Newest first
                </span>
              </div>
            }
          />
          <MonthChip>OCTOBER 2026</MonthChip>
          <DocCard
            spot="card1"
            meta="INV-1003 • 10/15/2026"
            amount="$400.00"
            anim={styles.aCard05}
            badge={{ icon: 'send', text: 'DUE NOV 14', bg: '#F2E5BC', color: '#3E3200', spot: 'dueBadge' }}
          />
          <MonthChip>SEPTEMBER 2026</MonthChip>
          <DocCard
            meta="INV-1002 • 9/23/2026"
            amount="$400.00"
            anim={styles.aCard12}
            badge={{ icon: 'send', text: 'DUE OCT 23', bg: '#F2E5BC', color: '#3E3200' }}
          />
          <DocCard
            meta="Draft • 9/20/2026"
            amount="$400.00"
            anim={styles.aCard19}
            badge={{ icon: 'history', text: 'DRAFT', bg: '#E9E4DC', color: '#6B6458', spot: 'draftBadge' }}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <StatusTabs
            left={
              <>
                <FilterPill label="Pending" count="2" on />
                <FilterPill label="Signed" count="1" on={false} />
              </>
            }
            summary={
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  font: '400 14.5px/1 var(--font-inter)',
                  color: '#4A443A',
                }}
              >
                <span>2 estimates</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="schedule" size={18} />
                  Newest first
                </span>
              </div>
            }
          />
          <MonthChip>OCTOBER 2026</MonthChip>
          <DocCard
            meta="E-2002 • 10/24/2026"
            amount="$400.00"
            anim={styles.aCard05}
            badge={{
              icon: 'send',
              text: 'VALID UNTIL NOV 23',
              bg: '#F2E5BC',
              color: '#3E3200',
              spot: 'dueBadge',
            }}
          />
          <DocCard
            meta="E-2001 • 10/20/2026"
            amount="$400.00"
            anim={styles.aCard12}
            badge={{ icon: 'send', text: 'SENT', bg: '#F2E5BC', color: '#3E3200' }}
          />
        </div>
      )}
    </div>
  );
}

// ─── invDetail ──────────────────────────────────────────────────────────────
function InvoiceDetail({ state }: { state: SceneState }) {
  const { amtDue } = state;
  return (
    <div
      className={styles.aSlideIn}
      style={{ position: 'absolute', top: 103, left: 0, right: 0, bottom: 84, overflow: 'hidden' }}
    >
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            padding: 18,
            borderRadius: 26,
            background: '#FAF2E6',
            border: '1.5px solid #EDE3D1',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 34,
                padding: '0 14px',
                borderRadius: 10,
                background: '#F2E5BC',
                font: '700 14px/1 var(--font-inter)',
                letterSpacing: '.1em',
                color: '#6E5800',
              }}
            >
              ● SENT · UNPAID
            </span>
            <span style={{ font: `600 14px/1 ${MONO}`, color: '#3E3830' }}>INV-1003</span>
          </div>
          <div>
            <div style={{ font: '800 30px/1.1 var(--font-montserrat)' }}>Brandon</div>
            <div style={{ marginTop: 4, font: '400 15px/1 var(--font-inter)', color: '#4A443A' }}>
              Invoice · sent
            </div>
          </div>
          <Perforation />
          <div>
            <div style={{ font: '600 15px/1 var(--font-inter)', color: '#3E3830' }}>Amount due</div>
            <div
              style={{
                marginTop: 6,
                font: '800 40px/1 var(--font-montserrat)',
                color: '#6E5800',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {amtDue}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              height: 52,
              padding: '0 16px',
              borderRadius: 16,
              background: '#fff',
              border: '1px solid #EFE6D6',
            }}
          >
            <Icon name="schedule" size={22} />
            <span style={{ font: '700 16px/1 var(--font-inter)' }}>Due 11/14/2026</span>
            <span style={{ marginLeft: 'auto', font: '400 14px/1 var(--font-inter)', color: '#4A443A' }}>
              in 21 days
            </span>
          </div>
          <div
            data-spot="actions"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8, borderRadius: 16 }}
          >
            <ActionTile icon="attach_file" label="Share PDF" />
            <ActionTile icon="link" label="Pay link" />
            <ActionTile icon="download" label="Download" />
            <ActionTile icon="preview" label="View PDF" />
          </div>
        </div>

        <div
          style={{
            padding: 18,
            borderRadius: 26,
            background: '#FAF2E6',
            border: '1.5px solid #EDE3D1',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ font: '600 15px/1 var(--font-inter)', letterSpacing: '.08em', color: '#3E3830' }}>
            LINE ITEMS
          </div>
          <div
            style={{
              background: '#FFFDF8',
              border: '1px solid #EFE6D6',
              borderRadius: 16,
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ font: '500 17px/1.2 var(--font-inter)' }}>
                <span style={{ fontFamily: MONO, color: '#8D8576', marginRight: 8 }}>1.</span>
                Bedroom Painting
              </div>
              <div style={{ margin: '5px 0 0 26px', font: '400 14.5px/1 var(--font-inter)', color: '#4A443A' }}>
                1 job × $400.00
              </div>
            </div>
            <div style={{ font: '800 17px/1.2 var(--font-montserrat)' }}>$400.00</div>
          </div>
        </div>
      </div>

      <div
        data-spot="recordPay"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 12,
          height: 58,
          borderRadius: 24,
          background: '#D4AF37',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 8px 0 20px',
          boxShadow: '0 10px 24px -12px rgba(120,90,10,.6)',
        }}
      >
        <Icon name="add" size={24} />
        <span style={{ font: '700 18px/1 var(--font-inter)', color: '#2A2410' }}>Record payment</span>
        <span
          style={{
            marginLeft: 'auto',
            height: 42,
            padding: '0 14px',
            borderRadius: 16,
            background: '#C29F2E',
            display: 'flex',
            alignItems: 'center',
            font: '800 15px/1 var(--font-montserrat)',
            color: '#2A2410',
          }}
        >
          $400.00 due
        </span>
      </div>
    </div>
  );
}

// ─── estDetail ──────────────────────────────────────────────────────────────
function EstimateDetail({ state }: { state: SceneState }) {
  const { st, eState, estSubtitle, sigP, sigClip } = state;
  const approved = eState === 'approved';
  const converted = eState === 'converted';
  const convertReady = Boolean(st.convert) && approved;
  return (
    <div
      className={styles.aSlideIn}
      style={{
        position: 'absolute',
        top: 103,
        left: 0,
        right: 0,
        bottom: 84,
        overflow: 'hidden',
        padding: '12px 16px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          padding: '16px 18px',
          borderRadius: 26,
          background: '#FAF2E6',
          border: '1.5px solid #EDE3D1',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div data-spot="estChip" style={{ borderRadius: 10 }}>
            {!approved && !converted && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 10,
                  background: '#F2E5BC',
                  font: '700 14px/1 var(--font-inter)',
                  letterSpacing: '.1em',
                  color: '#6E5800',
                }}
              >
                <Icon name="send" size={18} />
                SENT
              </span>
            )}
            {approved && (
              <span
                className={styles.aPop45}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 10,
                  background: '#C8F0D4',
                  font: '700 14px/1 var(--font-inter)',
                  letterSpacing: '.1em',
                  color: '#1E7A3C',
                }}
              >
                <Icon name="verified" size={18} />
                APPROVED
              </span>
            )}
            {converted && (
              <span
                className={styles.aPop45}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 10,
                  background: '#EEE8DE',
                  font: '700 14px/1 var(--font-inter)',
                  letterSpacing: '.1em',
                  color: '#3E3830',
                }}
              >
                <Icon name="lock" size={18} />
                CONVERTED
              </span>
            )}
          </div>
          <span style={{ font: `600 14px/1 ${MONO}`, color: '#3E3830' }}>E-2001</span>
        </div>
        <div>
          <div style={{ font: '800 28px/1.1 var(--font-montserrat)' }}>Brandon</div>
          <div style={{ marginTop: 4, font: '400 15px/1 var(--font-inter)', color: '#4A443A' }}>
            {estSubtitle}
          </div>
        </div>
        <Perforation />
        <div>
          <div style={{ font: '600 15px/1 var(--font-inter)', color: '#3E3830' }}>Estimate total</div>
          <div style={{ marginTop: 6, font: '800 38px/1 var(--font-montserrat)', color: '#6E5800' }}>
            $400.00
          </div>
        </div>
        {convertReady && (
          <div
            data-spot="convertBtn"
            className={styles.aPop5}
            style={{
              height: 54,
              borderRadius: 20,
              background: '#D4AF37',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              font: '700 18px/1 var(--font-inter)',
              color: '#2A2410',
            }}
          >
            <Icon name="autorenew" size={22} />
            Convert to Invoice
          </div>
        )}
        {converted && (
          <div
            data-spot="convertBtn"
            className={styles.aPop5}
            style={{
              height: 54,
              borderRadius: 20,
              background: '#C8F0D4',
              border: '1.5px solid #6FBF86',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              font: '700 17px/1 var(--font-inter)',
              color: '#1E7A3C',
            }}
          >
            <Icon name="check_circle" size={22} />
            Converted to an invoice
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
          <SmallTile icon="link" label="Copy link" size={21} />
          <SmallTile icon="share" label="Share" size={21} />
          <SmallTile icon="visibility" label="Preview as client" size={21} />
        </div>
      </div>

      <div
        data-spot="sigCard"
        style={{
          padding: '16px 18px',
          borderRadius: 26,
          background: '#FAF2E6',
          border: '1.5px solid #EDE3D1',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {sigP >= 1 ? (
          <div
            className={styles.aFade4}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              font: '700 15px/1 var(--font-inter)',
              letterSpacing: '.08em',
              color: '#1E7A3C',
            }}
          >
            <Icon name="verified" size={20} />
            SIGNED
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              font: '700 15px/1 var(--font-inter)',
              letterSpacing: '.08em',
              color: '#8D8576',
            }}
          >
            <DrawIcon size={20} />
            WAITING FOR SIGNATURE
          </div>
        )}
        <div
          style={{
            position: 'relative',
            height: 92,
            borderRadius: 16,
            background: '#FFFDF8',
            border: '1px solid #EFE6D6',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              font: '600 46px/1 var(--font-caveat), cursive',
              color: '#1E1A14',
              clipPath: sigClip,
              transform: 'rotate(-4deg)',
            }}
          >
            Brandon
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            font: '400 15px/1 var(--font-inter)',
            color: '#4A443A',
          }}
        >
          <span>Signer</span>
          <span style={{ fontWeight: 600, color: '#1E1A14' }}>Brandon</span>
        </div>
      </div>

      {st.toast && (
        <div
          data-spot="toast"
          className={styles.aCardIn}
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 20,
            background: '#2F2A24',
            color: '#FFF8EC',
            boxShadow: '0 14px 30px -12px rgba(20,16,10,.5)',
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              background: '#D4AF37',
              display: 'grid',
              placeItems: 'center',
              color: '#2A2410',
            }}
          >
            <Icon name="description" size={22} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ font: '700 15px/1.2 var(--font-inter)' }}>Invoice INV-1004 created</div>
            <div style={{ font: '400 13px/1.3 var(--font-inter)', color: '#BFB6A6' }}>
              Brandon · $400.00 · ready to send
            </div>
          </div>
          <span style={{ color: '#BFB6A6', display: 'flex' }}>
            <Icon name="chevron_right" size={22} />
          </span>
        </div>
      )}
    </div>
  );
}

function Perforation() {
  return (
    <div style={{ position: 'relative', height: 16, margin: '0 -26px' }}>
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 16,
          height: 16,
          borderRadius: 8,
          background: '#FDF7EE',
          border: '1px solid #EDE3D1',
        }}
      />
      <span
        style={{ position: 'absolute', left: 26, right: 26, top: 8, borderTop: '1.5px dashed #D9CFBD' }}
      />
      <span
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 16,
          height: 16,
          borderRadius: 8,
          background: '#FDF7EE',
          border: '1px solid #EDE3D1',
        }}
      />
    </div>
  );
}

function ActionTile({
  icon,
  label,
}: {
  icon: 'attach_file' | 'link' | 'download' | 'preview';
  label: string;
}) {
  return (
    <div
      style={{
        height: 68,
        borderRadius: 16,
        background: '#fff',
        border: '1px solid #EFE6D6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        font: '600 12.5px/1 var(--font-inter)',
      }}
    >
      <Icon name={icon} size={22} />
      {label}
    </div>
  );
}

function SmallTile({
  icon,
  label,
  size,
}: {
  icon: 'link' | 'share' | 'visibility';
  label: string;
  size: number;
}) {
  return (
    <div
      style={{
        height: 62,
        borderRadius: 16,
        background: '#fff',
        border: '1px solid #EFE6D6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        font: '600 12.5px/1 var(--font-inter)',
        // The prototype sets these labels on one line; the app's Inter is a
        // hair wider, so the longest label would otherwise wrap.
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={icon} size={size} />
      {label}
    </div>
  );
}

export default function InvoicesMock({ state }: { state: SceneState }) {
  const screen = state.st.screen;
  const back = screen === 'invDetail' || screen === 'estDetail';
  return (
    <div aria-hidden className={styles.mockProtoScope}>
      <MockChrome hdrChat={false} hdrBack={back} tabNow="invoices">
        {screen === 'invList' && <InvoiceList state={state} />}
        {screen === 'invDetail' && <InvoiceDetail state={state} />}
        {screen === 'estDetail' && <EstimateDetail state={state} />}
      </MockChrome>
    </div>
  );
}
