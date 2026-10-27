import Icon from '@/components/Icon';
import type { SceneState } from '../player-state';
import styles from '../tutorial.module.css';
import { MockChrome } from './MockChrome';

// Ported 1:1 from On It Tutorials.html — screen `clients` and its sheet.
// The third scene finishes on the chat template, which ChatMock already owns.

const SCRUB = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#'];

function Cursor({ opacity = 1 }: { opacity?: number }) {
  return (
    <span
      className={styles.aBlink}
      style={{
        display: 'inline-block',
        width: 2,
        height: '1.05em',
        marginLeft: 1,
        verticalAlign: '-.15em',
        background: '#1E1A14',
        opacity,
      }}
    />
  );
}

function ClientsList({ state }: { state: SceneState }) {
  const { st, sT } = state;
  return (
    <div className={styles.aFade35}>
      <div style={{ display: 'flex', gap: 12, marginTop: 16, paddingRight: 4 }}>
        <div
          data-spot="search"
          style={{
            flex: 1,
            height: 54,
            borderRadius: 27,
            background: '#fff',
            border: '1.5px solid #D2C8B6',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 18px',
            boxSizing: 'border-box',
            font: '400 18px/1 var(--font-inter)',
          }}
        >
          <span style={{ color: '#2F2A24', display: 'flex' }}>
            <Icon name="search" size={24} />
          </span>
          {sT.s ? (
            <span style={{ color: '#1E1A14' }}>
              {sT.s}
              <Cursor />
            </span>
          ) : (
            <span style={{ color: '#6B6458' }}>Search 1 client</span>
          )}
        </div>
        <span
          style={{
            flex: 'none',
            width: 54,
            height: 54,
            borderRadius: 27,
            background: '#D4AF37',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 8px 18px -8px rgba(120,90,10,.6)',
          }}
        >
          <Icon name="add" size={30} />
        </span>
      </div>

      <div style={{ margin: '22px 0 10px', font: '800 16px/1 var(--font-montserrat)', color: '#8A6E00' }}>
        B
      </div>

      <div
        data-spot="clientRow"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '4px 34px 14px 0',
          borderBottom: '1px solid #E6DCCB',
          borderRadius: 14,
        }}
      >
        <span
          style={{
            flex: 'none',
            width: 52,
            height: 52,
            borderRadius: 26,
            background: '#F2E5BC',
            display: 'grid',
            placeItems: 'center',
            font: '700 18px/1 var(--font-inter)',
            color: '#4A3B00',
          }}
        >
          B
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ font: '700 19px/1.2 var(--font-inter)' }}>Brandon</div>
          <span
            data-spot="estOut"
            style={{
              display: 'inline-block',
              marginTop: 3,
              padding: '2px 4px',
              marginLeft: -4,
              borderRadius: 8,
              font: '400 16px/1.2 var(--font-inter)',
              color: '#3E3830',
            }}
          >
            2 estimates out
          </span>
        </div>
        <span style={{ color: '#4A443A', display: 'flex' }}>
          <Icon name="chevron_right" size={22} />
        </span>
      </div>

      <div
        data-spot="scrubber"
        style={{
          position: 'absolute',
          right: 4,
          top: 150,
          width: 22,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          font: '700 11.5px/15.2px var(--font-inter)',
          color: '#B3AA99',
          borderRadius: 11,
        }}
      >
        {SCRUB.map((letter) => (
          <span
            key={letter}
            data-spot={letter === 'A' ? 'scrubA' : letter === 'B' ? 'scrubB' : undefined}
            style={letter === 'B' ? { color: '#8A6E00' } : undefined}
          >
            {letter}
          </span>
        ))}
      </div>

      {st.bubble && (
        <span
          className={styles.aPop35}
          style={{
            position: 'absolute',
            right: 52,
            top: 140,
            width: 64,
            height: 64,
            borderRadius: 32,
            background: '#2F2A24',
            color: '#FFF8EC',
            display: 'grid',
            placeItems: 'center',
            font: '800 30px/1 var(--font-montserrat)',
          }}
        >
          B
        </span>
      )}
    </div>
  );
}

function ProductsServices({ state }: { state: SceneState }) {
  const { st } = state;
  return (
    <div className={styles.aFade35}>
      {!st.psSaved && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 14,
            padding: '70px 18px 0',
          }}
        >
          <span
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              background: '#F2E5BC',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="handyman" size={38} />
          </span>
          <div style={{ font: '800 22px/1.2 var(--font-montserrat)' }}>Nothing saved yet</div>
          <div style={{ font: '400 16px/1.5 var(--font-inter)', color: '#4A443A', textWrap: 'pretty' }}>
            Add the jobs you do most, with a price if you have one. Picking one in an invoice fills in
            the price.
          </div>
          <div
            data-spot="addPS"
            style={{
              marginTop: 8,
              height: 56,
              padding: '0 26px',
              borderRadius: 28,
              background: '#D4AF37',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              font: '700 17px/1 var(--font-inter)',
              color: '#2A2410',
            }}
          >
            <Icon name="add" size={24} />
            Add product or service
          </div>
        </div>
      )}

      {st.psSaved && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
          <div
            data-spot="psItem"
            className={styles.aCardIn}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              borderRadius: 20,
              background: '#fff',
              border: '1px solid #E6DCCB',
            }}
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
              <Icon name="handyman" size={22} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ font: '700 17px/1.2 var(--font-inter)' }}>Bedroom Painting</div>
              <div style={{ font: '400 14px/1.3 var(--font-inter)', color: '#6B6458' }}>per job</div>
            </div>
            <span style={{ font: '800 18px/1 var(--font-montserrat)' }}>$400.00</span>
          </div>
          <div
            style={{
              height: 52,
              borderRadius: 26,
              border: '1.5px dashed #D2C8B6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              font: '700 16px/1 var(--font-inter)',
              color: '#6E5800',
            }}
          >
            <Icon name="add" size={22} />
            Add another
          </div>
        </div>
      )}
    </div>
  );
}

function ProductSheet({ state }: { state: SceneState }) {
  const { st, shN, shP } = state;
  const nameCur = !shP.s && shN.cur ? 1 : 0;
  const priceCur = shP.s ? 1 : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 25 }}>
      <div
        className={styles.aFade3}
        style={{ position: 'absolute', inset: 0, background: 'rgba(30,26,20,.38)' }}
      />
      <div
        className={styles.aSheet}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '12px 20px 34px',
          borderRadius: '30px 30px 0 0',
          background: '#FDF7EE',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <span style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, background: '#D9CFBD' }} />
        <div style={{ font: '800 22px/1.2 var(--font-montserrat)', marginTop: 4 }}>
          New product or service
        </div>
        <div
          style={{
            height: 54,
            borderRadius: 14,
            background: '#fff',
            border: '1.5px solid #D2C8B6',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 16px',
            font: '400 17px/1 var(--font-inter)',
          }}
        >
          <span style={{ color: '#4A443A', display: 'flex' }}>
            <Icon name="handyman" size={22} />
          </span>
          <span>
            {shN.s}
            <Cursor opacity={nameCur} />
          </span>
        </div>
        <div
          style={{
            height: 54,
            borderRadius: 14,
            background: '#fff',
            border: '1.5px solid #D2C8B6',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '0 16px',
            font: '400 17px/1 var(--font-inter)',
          }}
        >
          <span style={{ color: '#4A443A' }}>$</span>
          <span>
            {shP.s}
            <Cursor opacity={priceCur} />
          </span>
          <span style={{ marginLeft: 'auto', color: '#6B6458', fontSize: 15 }}>per job</span>
        </div>
        <div
          data-spot="sheetSave"
          style={{
            height: 54,
            borderRadius: 27,
            background: '#D4AF37',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: '700 18px/1 var(--font-inter)',
            color: '#2A2410',
          }}
        >
          Save
        </div>
      </div>
    </div>
  );
}

// ─── Laptop (xl) ────────────────────────────────────────────────────────────
// The design's 1380×860 laptop frame: a 288 sidebar and the Clients screen in
// the 1152 content area — a 40px title row (title, 340×40 pill tabs, 300×40
// search, 40 add), the list card with its letter header and A–Z rail, and the
// product sheet as a 512 centred dialog. Values are the export's
// (design/laptop/tutorial.html, LAPTOP-SPEC §3, MAPPING §8); the phone branch
// above is untouched.

function LaptopClients({ state }: { state: SceneState }) {
  const { st, sT, shN, shP } = state;
  const onPS = Boolean(st.ps);
  // 340 wide, 4 padding each side, columns 1fr / 1.5fr.
  const inner = 340 - 8;
  const clientsW = inner / 2.5;
  const psW = inner - clientsW;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div
        className={styles.aScrIn}
        style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', padding: '24px 32px 0', boxSizing: 'border-box' }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: 896, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Title row: title · pill tabs · search · add */}
          <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ font: '700 24px/1 var(--font-montserrat)' }}>Clients</span>
            <div
              style={{
                position: 'relative', width: 340, height: 40, borderRadius: 20,
                background: '#f5eddf', display: 'grid', gridTemplateColumns: '1fr 1.5fr',
              }}
            >
              <div
                style={{
                  position: 'absolute', top: 4, bottom: 4,
                  left: onPS ? 4 + clientsW : 4, width: onPS ? psW : clientsW,
                  borderRadius: 16, background: '#d4af37',
                  transition: 'left .5s cubic-bezier(.65,0,.35,1),width .5s cubic-bezier(.65,0,.35,1)',
                }}
              />
              <span style={{ position: 'relative', display: 'grid', placeItems: 'center', font: '600 14px/1 var(--font-inter)' }}>
                Clients
              </span>
              <span
                data-spot="psTab"
                style={{
                  position: 'relative', display: 'grid', placeItems: 'center',
                  font: '600 14px/1 var(--font-inter)', borderRadius: 16,
                }}
              >
                Products &amp; Services
              </span>
            </div>
            {!onPS && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div
                  data-spot="search"
                  style={{
                    width: 300, height: 40, borderRadius: 20, background: '#fff',
                    border: '1.5px solid #d0c5af', display: 'flex', alignItems: 'center',
                    gap: 8, padding: '0 14px', boxSizing: 'border-box',
                    font: '400 15px/1 var(--font-inter)',
                  }}
                >
                  <span style={{ display: 'flex', color: '#4d4635' }}>
                    <Icon name="search" size={20} />
                  </span>
                  {sT.s ? (
                    <span>
                      {sT.s}
                      <Cursor />
                    </span>
                  ) : (
                    <span style={{ color: '#4d4635' }}>Search 1 client</span>
                  )}
                </div>
                <span
                  style={{ width: 40, height: 40, borderRadius: 20, background: '#d4af37', display: 'grid', placeItems: 'center', color: '#1f1b13' }}
                >
                  <Icon name="add" size={24} />
                </span>
              </div>
            )}
          </div>

          {!onPS && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 22px', gap: 12, alignItems: 'start' }}>
              <div style={{ borderRadius: 20, background: '#fff', border: '1px solid #efe4d2', overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 200px 24px', gap: 14,
                    padding: '10px 18px', background: '#fbf3e5',
                    font: '700 11.5px/1 var(--font-inter)', letterSpacing: '.1em', color: '#735c00',
                  }}
                >
                  B
                </div>
                <div
                  data-spot="clientRow"
                  className={styles.rowHover}
                  style={{
                    display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto 24px', gap: 14,
                    alignItems: 'center', padding: '10px 18px', borderTop: '1px solid #f0e7d8',
                    borderRadius: 14,
                  }}
                >
                  <span
                    style={{
                      width: 40, height: 40, borderRadius: 20, background: '#f0e3b8',
                      display: 'grid', placeItems: 'center', font: '700 16px/1 var(--font-inter)', color: '#554300',
                    }}
                  >
                    B
                  </span>
                  <span style={{ font: '700 16px/1.2 var(--font-inter)' }}>Brandon</span>
                  <span
                    data-spot="estOut"
                    style={{ padding: '3px 6px', borderRadius: 8, font: '400 14.5px/1.2 var(--font-inter)', color: '#4d4635' }}
                  >
                    2 estimates out
                  </span>
                  <span style={{ display: 'flex', color: '#4d4635' }}>
                    <Icon name="chevron_right" size={20} />
                  </span>
                </div>
              </div>
              <div
                data-spot="scrubber"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  font: '700 10.5px/14px var(--font-inter)', color: '#7f7663',
                  borderRadius: 11, padding: '4px 0', alignSelf: 'start',
                }}
              >
                {SCRUB.map((letter) => (
                  <span
                    key={letter}
                    data-spot={letter === 'A' ? 'scrubA' : letter === 'B' ? 'scrubB' : undefined}
                    style={letter === 'B' ? { color: '#735c00' } : undefined}
                  >
                    {letter}
                  </span>
                ))}
              </div>
            </div>
          )}

          {onPS && !st.psSaved && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '72px 0 0' }}>
              <span style={{ width: 80, height: 80, borderRadius: 20, background: '#f0e3b8', display: 'grid', placeItems: 'center', color: '#2f2a24' }}>
                <Icon name="handyman" size={38} />
              </span>
              <div style={{ font: '700 22px/1.2 var(--font-montserrat)' }}>Nothing saved yet</div>
              <div style={{ maxWidth: 400, font: '400 16px/1.5 var(--font-inter)', color: '#4d4635', textWrap: 'pretty' }}>
                Add the jobs you do most, with a price if you have one. Picking one in an invoice fills in the price.
              </div>
              <div
                data-spot="addPS"
                style={{
                  marginTop: 8, height: 48, padding: '0 24px', borderRadius: 999,
                  background: '#d4af37', display: 'flex', alignItems: 'center', gap: 8,
                  font: '700 16px/1 var(--font-inter)',
                }}
              >
                <Icon name="add" size={22} />
                Add product or service
              </div>
            </div>
          )}

          {onPS && st.psSaved && (
            <div style={{ borderRadius: 20, background: '#fff', border: '1px solid #efe4d2', overflow: 'hidden' }}>
              <div
                data-spot="psItem"
                className={styles.aCardIn}
                style={{
                  display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 14,
                  alignItems: 'center', padding: '12px 18px',
                }}
              >
                <span style={{ width: 40, height: 40, borderRadius: 12, background: '#f0e3b8', display: 'grid', placeItems: 'center', color: '#2f2a24' }}>
                  <Icon name="handyman" size={20} />
                </span>
                <div>
                  <div style={{ font: '700 16px/1.2 var(--font-inter)' }}>Bedroom Painting</div>
                  <div style={{ font: '400 13.5px/1.3 var(--font-inter)', color: '#4d4635' }}>per job</div>
                </div>
                <span style={{ font: '800 17px/1 var(--font-montserrat)' }}>$400.00</span>
              </div>
            </div>
          )}

          {st.bubble && (
            <span
              className={styles.aPop35}
              style={{
                position: 'absolute', right: 48, top: 96, width: 56, height: 56, borderRadius: 28,
                background: '#343027', color: '#fff8f0', display: 'grid', placeItems: 'center',
                font: '800 26px/1 var(--font-montserrat)',
              }}
            >
              B
            </span>
          )}
        </div>
      </div>

      {st.sheet && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 25, display: 'grid', placeItems: 'center' }}>
          <div className={styles.aFade3} style={{ position: 'absolute', inset: 0, background: 'rgba(31,27,19,.38)' }} />
          <div
            role="dialog"
            className={styles.aDlgIn}
            style={{
              position: 'relative', width: 512, padding: 24, borderRadius: 20, background: '#fff8f0',
              display: 'flex', flexDirection: 'column', gap: 14,
              boxShadow: '0 30px 70px -20px rgba(52,48,39,.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, font: '700 22px/1.2 var(--font-montserrat)' }}>New product or service</div>
              <span style={{ width: 36, height: 36, borderRadius: 18, background: '#efe7da', display: 'grid', placeItems: 'center', color: '#2f2a24' }}>
                <Icon name="close" size={20} />
              </span>
            </div>
            <div
              style={{
                height: 48, borderRadius: 12, background: '#f5eddf',
                border: '1px solid rgba(212,175,55,.2)', display: 'flex', alignItems: 'center',
                gap: 10, padding: '0 14px', font: '400 16px/1 var(--font-inter)',
              }}
            >
              <span style={{ display: 'flex', color: '#4d4635' }}>
                <Icon name="handyman" size={20} />
              </span>
              <span>
                {shN.s}
                <Cursor opacity={!shP.s && shN.cur ? 1 : 0} />
              </span>
            </div>
            <div
              style={{
                height: 48, borderRadius: 12, background: '#f5eddf',
                border: '1px solid rgba(212,175,55,.2)', display: 'flex', alignItems: 'center',
                gap: 4, padding: '0 14px', font: '400 16px/1 var(--font-inter)',
              }}
            >
              <span style={{ color: '#4d4635' }}>$</span>
              <span>
                {shP.s}
                <Cursor opacity={shP.s ? 1 : 0} />
              </span>
            </div>
            <div
              data-spot="sheetSave"
              style={{
                alignSelf: 'flex-end', height: 44, padding: '0 28px', borderRadius: 999,
                background: '#d4af37', display: 'flex', alignItems: 'center',
                font: '700 16px/1 var(--font-inter)',
              }}
            >
              Save
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientsMock({ state, laptop = false }: { state: SceneState; laptop?: boolean }) {
  const { st } = state;
  const onPS = Boolean(st.ps);
  if (laptop) {
    // The overlay already wraps the mock in LaptopShell (288 sidebar, 1152 content),
    // so this screen is only the content area's contents.
    return (
      <div aria-hidden className={styles.mockProtoScope}>
        <LaptopClients state={state} />
      </div>
    );
  }
  return (
    <div aria-hidden className={styles.mockProtoScope}>
      <MockChrome hdrChat={false} hdrBack={false} tabNow="clients">
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
                left: onPS ? '50%' : '5px',
                width: 'calc(50% - 5px)',
                borderRadius: 23,
                background: '#D4AF37',
                boxShadow: '0 6px 16px -8px rgba(120,90,10,.5)',
                transition: 'left .5s cubic-bezier(.65,0,.35,1)',
              }}
            />
            <span
              style={{
                position: 'relative',
                display: 'grid',
                placeItems: 'center',
                font: '600 16px/1 var(--font-inter)',
                color: '#2A2410',
              }}
            >
              Clients
            </span>
            <span
              data-spot="psTab"
              style={{
                position: 'relative',
                display: 'grid',
                placeItems: 'center',
                font: '600 16px/1 var(--font-inter)',
                color: '#2A2410',
                borderRadius: 23,
              }}
            >
              Products &amp; Services
            </span>
          </div>

          {!onPS && <ClientsList state={state} />}
          {onPS && <ProductsServices state={state} />}
        </div>

        {st.sheet && <ProductSheet state={state} />}
      </MockChrome>
    </div>
  );
}
