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

export default function ClientsMock({ state }: { state: SceneState }) {
  const { st } = state;
  const onPS = Boolean(st.ps);
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
