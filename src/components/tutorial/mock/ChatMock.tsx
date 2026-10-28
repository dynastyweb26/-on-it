import Icon from '@/components/Icon';
import type { SceneState } from '../player-state';
import styles from '../tutorial.module.css';
import { MockChrome } from './MockChrome';
import { BookmarkIcon } from './icons';

function Cursor() {
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
      }}
    />
  );
}

function Mono({
  children,
  size = 9.5,
  weight = 500,
  lineHeight = 1.55,
  color,
}: {
  children: React.ReactNode;
  size?: number;
  weight?: number;
  lineHeight?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-plex-mono), monospace',
        fontSize: size,
        fontWeight: weight,
        lineHeight,
        color,
      }}
    >
      {children}
    </span>
  );
}

/** The laptop chat card (design/laptop/tutorial.html `invCard`): 560 wide at the
 *  left of the 720 column, the design's 2-column body (name | item panel), a
 *  wrapping chip row and a 48px footer. Ported element-for-element from the
 *  design; the phone keeps the stacked card below. */
function LaptopInvoiceCard({ state, isEst }: { state: SceneState; isEst: boolean }) {
  const { st, nT, jT, pT, nameFilled, jobFilled, priceFilled, footFilled } = state;
  const chip = {
    height: 36,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 12px',
    borderRadius: 999,
    font: '700 14px/1 var(--font-inter)',
    color: '#735C00',
    background: '#fff',
    border: '1px solid #EFE4D2',
    whiteSpace: 'nowrap' as const,
  };
  const ghostChip = {
    ...chip,
    border: '1.5px dashed #D0C5AF',
    boxSizing: 'border-box' as const,
    font: '400 14px/1 var(--font-inter)',
    color: '#4D4635',
  };
  return (
    <div
      data-spot="invCard"
      className={styles.aCardIn55}
      style={{
        width: '100%',
        maxWidth: 560,
        boxSizing: 'border-box',
        padding: 16,
        background: '#FBF3E5',
        border: '1.5px solid #EFE4D2',
        borderRadius: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34 }}>
        <div className={styles.aPop45} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              padding: '0 12px 0 9px',
              borderRadius: 8,
              background: '#F3E9C8',
              font: '600 14px/1 var(--font-inter)',
              color: '#554300',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon name={isEst ? 'request_quote' : 'description'} size={19} />
            {isEst ? 'New estimate' : 'New invoice'}
          </span>
          <span
            data-spot="toggle"
            style={{
              font: '700 14px/1 var(--font-inter)',
              color: '#735C00',
              padding: '7px 4px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
            }}
          >
            {isEst ? 'Make it an invoice' : 'Make it an estimate'}
          </span>
        </div>
        <span
          style={{
            marginLeft: 'auto',
            flex: 'none',
            width: 32,
            height: 32,
            borderRadius: 16,
            background: '#EFE7DA',
            display: 'grid',
            placeItems: 'center',
            color: '#2F2A24',
          }}
        >
          <Icon name="close" size={19} />
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 10, alignItems: 'start' }}>
        <div>
          {nameFilled ? (
            <div
              className={styles.aPop4}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 44,
                padding: '0 12px',
                borderRadius: 12,
                background: '#343027',
              }}
            >
              <span style={{ display: 'flex', color: '#E9C349' }}>
                <Icon name="person" size={22} filled />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '700 15px/1.2 var(--font-montserrat)', color: '#FFF8F0' }}>Brandon</div>
                <div style={{ font: '400 11.5px/1.2 var(--font-inter)', color: '#D0C5AF', whiteSpace: 'nowrap' }}>
                  No address or phone on file
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 44,
                padding: '0 12px',
                border: '1.5px dashed #D0C5AF',
                borderRadius: 12,
                boxSizing: 'border-box',
                font: '400 15px/1 var(--font-inter)',
                color: '#4D4635',
              }}
            >
              <span style={{ display: 'flex' }}>
                <Icon name="person" size={20} />
              </span>
              {nT.s.length > 0 ? (
                <span style={{ color: '#1F1B13' }}>
                  {nT.s}
                  <Cursor />
                </span>
              ) : (
                <span>Name</span>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #EFE4D2',
            borderRadius: 14,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {jobFilled ? (
            <div
              className={styles.aPop4}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 40,
                padding: '0 12px',
                borderRadius: 10,
                background: '#343027',
              }}
            >
              <span style={{ display: 'flex', color: '#E9C349' }}>
                <Icon name="handyman" size={20} />
              </span>
              <span style={{ font: '700 15px/1 var(--font-montserrat)', color: '#FFF8F0', whiteSpace: 'nowrap' }}>
                {st.job || 'Bedroom Painting'}
              </span>
              <span style={{ font: '400 14px/1 var(--font-inter)', color: '#D0C5AF' }}>· job</span>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 40,
                padding: '0 12px',
                border: '1.5px dashed #D0C5AF',
                borderRadius: 10,
                boxSizing: 'border-box',
                font: '400 15px/1 var(--font-inter)',
                color: '#4D4635',
              }}
            >
              <span style={{ display: 'flex' }}>
                <Icon name="handyman" size={20} />
              </span>
              {jT.s.length > 0 ? (
                <span style={{ color: '#1F1B13' }}>
                  {jT.s}
                  <Cursor />
                </span>
              ) : (
                <span>Product/Service</span>
              )}
            </div>
          )}

          {st.suggest && (
            <div
              data-spot="suggest"
              className={styles.aCardIn35}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 10,
                background: '#FBF3E5',
                border: '1px solid #EFE4D2',
              }}
            >
              <span style={{ display: 'flex', color: '#735C00' }}>
                <BookmarkIcon size={19} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '600 14px/1.2 var(--font-inter)' }}>Bedroom Painting</div>
                <div style={{ font: '400 12px/1.3 var(--font-inter)', color: '#4D4635' }}>Saved service</div>
              </div>
              <span style={{ font: '700 14px/1 var(--font-montserrat)' }}>$400.00</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 10, background: '#F5EDDF' }}>
              <span style={{ width: 24, textAlign: 'center', color: '#7F7663', display: 'flex', justifyContent: 'center' }}>
                <Icon name="remove" size={18} />
              </span>
              <span
                style={{
                  width: 30,
                  height: 28,
                  borderRadius: 8,
                  background: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  font: '500 14px/1 var(--font-inter)',
                  color: '#7F7663',
                }}
              >
                1
              </span>
              <span style={{ width: 24, textAlign: 'center', color: '#2F2A24', display: 'flex', justifyContent: 'center' }}>
                <Icon name="add" size={18} />
              </span>
            </div>
            <span style={{ color: '#7F7663' }}>×</span>
            {priceFilled ? (
              <span
                data-spot="tplPrice"
                className={styles.aPrice}
                style={{
                  display: 'block',
                  height: 34,
                  padding: '0 12px',
                  borderRadius: 10,
                  background: '#343027',
                  color: '#FFF8F0',
                  font: '700 15px/34px var(--font-montserrat)',
                }}
              >
                $400.00
              </span>
            ) : (
              <span
                data-spot="tplPrice"
                style={{
                  height: 34,
                  padding: '0 12px',
                  border: '1.5px dashed #D0C5AF',
                  borderRadius: 10,
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  font: '400 15px/1 var(--font-inter)',
                  color: '#4D4635',
                }}
              >
                $
                {pT.s.length > 0 ? (
                  <span style={{ color: '#1F1B13' }}>
                    {pT.s}
                    <Cursor />
                  </span>
                ) : (
                  <span>Price</span>
                )}
              </span>
            )}
            <span style={{ marginLeft: 'auto', font: '700 15px/1 var(--font-montserrat)', color: state.lineColor }}>
              {state.lineTotal}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={chip}>
          <Icon name="add" size={19} />
          Add item
        </span>
        <span style={chip}>
          <Icon name="add" size={19} />
          Add attachment
        </span>
        <span style={ghostChip}>
          <Icon name="add" size={19} />
          Add tax
        </span>
        <span style={ghostChip}>
          <Icon name="sticky_note_2" size={19} />
          Extra info<span style={{ color: '#7F7663' }}>· dates, notes, deposit</span>
        </span>
      </div>

      <div style={{ height: 1, background: '#EFE4D2' }} />

      <div data-spot="invFoot" style={{ borderRadius: 14 }}>
        {footFilled ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span style={{ font: '400 13.5px/1 var(--font-inter)', color: '#4D4635' }}>
                Subtotal {state.totalStr}
              </span>
              <span style={{ font: '400 14px/1 var(--font-inter)', color: '#4D4635' }}>Total</span>
              <span style={{ font: '800 26px/1 var(--font-montserrat)', fontVariantNumeric: 'tabular-nums' }}>
                {state.totalStr}
              </span>
            </div>
            <span
              className={styles.aPop4}
              style={{
                flex: 'none',
                width: 44,
                height: 44,
                borderRadius: 22,
                background: '#1F1B13',
                color: '#FFF8F0',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="north_east" size={22} />
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 }}>
            <span style={{ font: '400 14px/1.3 var(--font-inter)', color: '#4D4635' }}>
              Add a client and an item to send
            </span>
            <span
              style={{
                flex: 'none',
                width: 44,
                height: 44,
                borderRadius: 22,
                background: '#EFE7DA',
                color: '#7F7663',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="north_east" size={22} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** The laptop expense sheet (design `expCard`): 520 wide at the column's left,
 *  date beside the amount, 40px category tiles and the save pill sharing its
 *  row with "Change something". Phone keeps the stacked sheet below. */
function LaptopExpenseCard({ state }: { state: SceneState }) {
  const { st } = state;
  const savePill = {
    flex: 1,
    height: 48,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    font: '700 16px/1 var(--font-inter)',
  };
  return (
    <div
      className={styles.aCardIn6}
      style={{
        width: '100%',
        maxWidth: 520,
        boxSizing: 'border-box',
        padding: 18,
        background: '#FBF3E5',
        border: '1.5px solid #EFE4D2',
        borderRadius: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ font: '800 13px/1 var(--font-montserrat)', letterSpacing: '.16em', color: '#735C00' }}>EXPENSE</div>
          <div style={{ marginTop: 6, font: '400 14px/1 var(--font-inter)', color: '#4D4635' }}>From your receipt</div>
        </div>
        <span style={{ display: 'flex', color: '#1F1B13' }}>
          <Icon name="close" size={22} />
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ font: '800 44px/1 var(--font-montserrat)', fontVariantNumeric: 'tabular-nums' }}>{state.expAmt}</div>
        <span
          style={{
            height: 38,
            padding: '0 14px',
            borderRadius: 999,
            background: '#fff',
            border: '1.5px solid #D0C5AF',
            display: 'flex',
            alignItems: 'center',
            font: '600 14px/1 var(--font-inter)',
            whiteSpace: 'nowrap',
          }}
        >
          Oct 25, 2026
        </span>
      </div>

      <div
        style={{
          paddingBottom: 7,
          borderBottom: '1.5px dashed #D0C5AF',
          font: '400 17px/1 var(--font-inter)',
          color: '#7F7663',
        }}
      >
        <span style={{ color: '#1F1B13', fontWeight: 500 }}>at</span> Fuel Stop
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
        {['Food', 'Fuel', 'Supplies', 'Tools'].map((cat) => {
          const fuel = cat === 'Fuel' && st.fuel;
          return (
            <span
              key={cat}
              className={fuel ? styles.aPop4 : undefined}
              style={{
                height: 40,
                borderRadius: 12,
                border: fuel ? '2px solid #D4AF37' : '1.5px solid #7F7663',
                boxSizing: 'border-box',
                background: fuel ? '#F3E9C8' : '#fff',
                boxShadow: fuel ? '0 0 0 2px #FFF8F0,0 0 0 4px #D4AF37' : undefined,
                display: 'grid',
                placeItems: 'center',
                font: `${fuel ? 700 : 600} 14px/1 var(--font-inter)`,
              }}
            >
              {cat}
            </span>
          );
        })}
      </div>

      <div
        style={{
          height: 44,
          borderRadius: 12,
          background: '#F5EDDF',
          border: '1px solid #EFE4D2',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          font: '400 15px/1 var(--font-inter)',
          color: '#7F7663',
        }}
      >
        <span style={{ display: 'flex' }}>
          <Icon name="edit" size={19} />
        </span>
        Add what you bought (optional)
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {st.saved ? (
          <div
            data-spot="saveExpense"
            className={styles.aPop4}
            style={{ ...savePill, background: '#343027', color: '#FFF8F0' }}
          >
            <span style={{ display: 'flex', color: '#E9C349' }}>
              <Icon name="check" size={22} />
            </span>
            Saved to Books
          </div>
        ) : (
          <div data-spot="saveExpense" style={{ ...savePill, background: '#D4AF37' }}>
            <span style={{ display: 'flex' }}>
              <Icon name="check_circle" size={22} />
            </span>
            Save expense
          </div>
        )}
        <span
          style={{
            font: '500 15px/1 var(--font-inter)',
            textDecoration: 'underline',
            textUnderlineOffset: 4,
            whiteSpace: 'nowrap',
          }}
        >
          Change something
        </span>
      </div>
    </div>
  );
}

/** The laptop "ready to share" card (design `readyCard`): 720 wide, the estimate
 *  on the left and the share block in its own column on the right. Phone keeps
 *  the single-column card below. */
function LaptopReadyCard({ state }: { state: SceneState }) {
  const { st } = state;
  return (
    <>
    {/* The real chat shows the spoken request and On It's reply above the
        locked card; the design export starts at the card. */}
    <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 12px 10px' }}>
      <div
        style={{
          maxWidth: '78%',
          padding: '10px 14px',
          borderRadius: 18,
          background: '#F2E5BC',
          font: '400 15px/1.35 var(--font-inter)',
          color: '#1E1A14',
        }}
      >
        estimate for brandon $400 for fence repair
      </div>
    </div>
    <div style={{ margin: '0 12px 10px', font: '400 15px/1.4 var(--font-inter)', color: '#2F2A24' }}>
      On it — here&apos;s the estimate for Brandon.
    </div>
    <div
      className={styles.aCardIn55}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: 20,
        background: '#FBF3E5',
        border: '1.5px solid #EFE4D2',
        borderRadius: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            font: '800 14px/1 var(--font-montserrat)',
            letterSpacing: '.06em',
            color: '#735C00',
          }}
        >
          <span style={{ display: 'flex' }}>
            <Icon name="description" size={20} />
          </span>
          ESTIMATE FOR BRANDON
        </div>
        <span
          data-spot="readyChip"
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            height: 30,
            padding: '0 12px 0 10px',
            borderRadius: 8,
            background: '#EFE7DA',
            font: '600 14px/1 var(--font-inter)',
          }}
        >
          <span style={{ display: 'flex' }}>
            <Icon name="lock" size={17} filled />
          </span>
          Ready to share
        </span>
        <div
          style={{
            background: '#fff',
            border: '1px solid #EFE4D2',
            borderRadius: 14,
            padding: '12px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div>
            <div style={{ font: '500 16px/1.2 var(--font-inter)' }}>
              <Mono size={16} weight={500} lineHeight={1.2} color="#7F7663">
                <span style={{ marginRight: 8 }}>1.</span>
              </Mono>
              Fence Repair
            </div>
            <div style={{ margin: '4px 0 0 24px', font: '400 14px/1 var(--font-inter)', color: '#4D4635' }}>
              1 job × $400.00
            </div>
          </div>
          <div style={{ font: '800 16px/1.2 var(--font-montserrat)' }}>$400.00</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ font: '600 14px/1 var(--font-inter)', color: '#4D4635' }}>Deposit required</span>
            <span
              style={{
                height: 36,
                padding: '0 10px',
                borderRadius: 12,
                background: '#fff',
                border: '1px solid #EFE4D2',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                font: '500 14px/1 var(--font-inter)',
                color: '#4D4635',
                whiteSpace: 'nowrap',
              }}
            >
              None
              <span style={{ display: 'flex' }}>
                <Icon name="unfold_more" size={17} />
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ font: '600 14px/1 var(--font-inter)', color: '#4D4635' }}>Tax</span>
            <span
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 12,
                background: '#fff',
                border: '1px solid #EFE4D2',
                font: '600 13.5px/36px var(--font-inter)',
                color: '#735C00',
                whiteSpace: 'nowrap',
              }}
            >
              + Add tax
            </span>
          </div>
        </div>
        <div>
          <div style={{ font: '600 14px/1 var(--font-inter)', color: '#4D4635', marginBottom: 6 }}>Notes</div>
          <div
            style={{
              padding: '9px 12px',
              borderRadius: 12,
              background: '#fff',
              border: '1px solid #EFE4D2',
              font: '400 14px/1.4 var(--font-inter)',
              color: '#7F7663',
            }}
          >
            Deposit due before materials are ordered. 3-5 day lead time.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            paddingTop: 10,
            borderTop: '1px solid #EFE4D2',
          }}
        >
          <span style={{ font: '700 13px/1 var(--font-inter)', letterSpacing: '.1em', color: '#4D4635' }}>
            ESTIMATE TOTAL
          </span>
          <span style={{ font: '800 34px/1 var(--font-montserrat)' }}>$400.00</span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingLeft: 20,
          borderLeft: '1px solid #EFE4D2',
        }}
      >
        <div style={{ font: '400 15px/1.35 var(--font-inter)' }}>Copy or share the link with Brandon.</div>
        <div
          style={{
            padding: '9px 12px',
            borderRadius: 12,
            background: '#fff',
            border: '1px solid #EFE4D2',
            font: '500 13px/1.3 var(--font-plex-mono), monospace',
            color: '#4D4635',
            overflowWrap: 'anywhere',
          }}
        >
          https://onit.app/e/sample-estimate
        </div>
        <div data-spot="shareBtns" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, borderRadius: 14 }}>
          <div
            data-spot="copyLink"
            style={{
              height: 44,
              borderRadius: 999,
              background: '#fff',
              border: '1.5px solid #D0C5AF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              font: '700 15px/1 var(--font-inter)',
              color: '#735C00',
            }}
          >
            {st.copied ? (
              <span className={styles.aPop35} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={20} />
                Copied
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="link" size={20} />
                Copy link
              </span>
            )}
          </div>
          <div
            style={{
              height: 44,
              borderRadius: 999,
              background: '#fff',
              border: '1.5px solid #D0C5AF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              font: '700 15px/1 var(--font-inter)',
              color: '#735C00',
            }}
          >
            <span style={{ display: 'flex' }}>
              <Icon name="share" size={20} />
            </span>
            Share
          </div>
        </div>
        <div data-spot="revise" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 18 }}>
          <div
            style={{
              height: 48,
              borderRadius: 999,
              background: '#D4AF37',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              font: '700 16px/1 var(--font-inter)',
            }}
          >
            <span style={{ display: 'flex' }}>
              <Icon name="edit" size={20} />
            </span>
            Revise
          </div>
          <div style={{ font: '400 13px/1.4 var(--font-inter)', color: '#4D4635' }}>
            Makes a new estimate you can edit. This one and its link stay as they are.
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default function ChatMock({
  state,
  chatMax,
  nudge = 0,
  laptop,
}: {
  state: SceneState;
  chatMax: number;
  nudge?: number;
  /** Laptop stage (>= 1280): the composer group is the design's 612x44
   *  inside the 720 column. Absent everywhere else, so the phone is untouched. */
  laptop?: boolean;
}) {
  const { st, nT, jT, pT, comp, nameFilled, jobFilled, priceFilled, footFilled } = state;
  if (st.screen !== 'chat') return null;

  const isEst = Boolean(st.estCard);
  const showCard = Boolean(st.tpl);
  const chatBottom = state.composerOn ? (laptop ? 80 : 72) : 0;
  const chatShift = st.ready && st.scrollEnd ? -chatMax : 0;

  return (
    <div aria-hidden>
      <MockChrome hdrChat hdrBack={false} tabNow="chat" laptop={laptop}>
        <div
          className={styles.aScrIn}
          style={{
            position: 'absolute',
            top: laptop ? 0 : 103,
            left: 0,
            right: 0,
            bottom: laptop ? 0 : 84,
          }}
        >
          <div
            data-chat-area
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: chatBottom,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: st.ready ? 'flex-start' : 'flex-end',
            }}
          >
            <div
              data-chat-content
              data-tut-base={chatShift}
              style={{
                flex: 'none',
                // Laptop: the design's 720 column, centred in the content area.
                width: laptop ? 720 : undefined,
                margin: laptop ? '0 auto' : undefined,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                padding: laptop ? '20px 0' : '16px 0',
                transform: `translateY(${chatShift + nudge}px)`,
                transition: 'transform 1s cubic-bezier(.65,0,.35,1)',
              }}
            >
              {!st.ready && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div
                    style={{
                      textAlign: 'center',
                      font: '600 12.5px/1 var(--font-inter)',
                      letterSpacing: '.12em',
                      color: '#7D7568',
                    }}
                  >
                    TODAY
                  </div>
                  <div
                    style={{
                      margin: '0 16px',
                      maxWidth: 300,
                      padding: '12px 16px',
                      background: '#F5EDE0',
                      border: '1px solid #E4D9C6',
                      borderRadius: 22,
                      font: '400 16px/1.4 var(--font-inter)',
                      color: '#1E1A14',
                    }}
                  >
                    Evening! Snap a receipt, or tap + to start an invoice or estimate.
                  </div>
                </div>
              )}

              {st.receipt && (
                <div
                  className={styles.aCardIn}
                  style={{
                    alignSelf: 'flex-end',
                    marginRight: 16,
                    width: 128,
                    padding: 6,
                    background: '#EFE6D8',
                    borderRadius: '20px 20px 6px 20px',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      background: '#FFFDF8',
                      borderRadius: 14,
                      padding: '11px 10px',
                      color: '#3B362F',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <Mono weight={600} lineHeight={1.55}>
                        <span style={{ letterSpacing: '.08em' }}>FUEL STOP</span>
                      </Mono>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <Mono color="#8D8576" lineHeight={1.55}>
                        10/25/2026
                      </Mono>
                    </div>
                    <div style={{ borderTop: '1px dashed #CFC6B6', margin: '4px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Mono lineHeight={1.55}>REGULAR</Mono>
                      <Mono lineHeight={1.55}>10.26 GAL</Mono>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Mono lineHeight={1.55}>PER GAL</Mono>
                      <Mono lineHeight={1.55}>$3.90</Mono>
                    </div>
                    <div style={{ borderTop: '1px dashed #CFC6B6', margin: '4px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Mono weight={600} size={11} lineHeight={1.55}>
                        TOTAL
                      </Mono>
                      <Mono weight={600} size={11} lineHeight={1.55}>
                        $40.00
                      </Mono>
                    </div>
                    <div
                      className={styles.aScan}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        height: 24,
                        marginTop: -12,
                        background:
                          'linear-gradient(180deg,rgba(212,175,55,0),rgba(212,175,55,.5),rgba(212,175,55,0))',
                      }}
                    />
                  </div>
                </div>
              )}

              {showCard &&
                (laptop ? (
                  <LaptopInvoiceCard state={state} isEst={isEst} />
                ) : (
                <div
                  data-spot="invCard"
                  className={styles.aCardIn55}
                  style={{
                    margin: '0 12px',
                    padding: 14,
                    background: '#FAF2E6',
                    border: '1.5px solid #E8DDC8',
                    borderRadius: 26,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36 }}>
                    <div className={styles.aPop45} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 34,
                          padding: '0 12px 0 9px',
                          borderRadius: 12,
                          background: '#F2E5BC',
                          font: '600 14.5px/1 var(--font-inter)',
                          color: '#3E3200',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Icon name={isEst ? 'request_quote' : 'description'} size={20} />
                        {isEst ? 'New estimate' : 'New invoice'}
                      </span>
                      <span
                        data-spot="toggle"
                        style={{
                          font: '700 14.5px/1 var(--font-inter)',
                          color: '#7A6200',
                          padding: '7px 3px',
                          borderRadius: 8,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isEst ? 'Make it an invoice' : 'Make it an estimate'}
                      </span>
                    </div>
                    <span
                      style={{
                        marginLeft: 'auto',
                        flex: 'none',
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        background: '#EFE7DA',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#2F2A24',
                      }}
                    >
                      <Icon name="close" size={20} />
                    </span>
                  </div>

                  {nameFilled ? (
                    <div
                      className={styles.aPop4}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '9px 14px',
                        borderRadius: 14,
                        background: '#2F2A24',
                      }}
                    >
                      <span style={{ display: 'flex', color: '#E2BC45' }}>
                        <Icon name="person" size={24} filled />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: '700 17px/1.2 var(--font-montserrat)', color: '#FFF8EC' }}>Brandon</div>
                        <div style={{ font: '400 13px/1.3 var(--font-inter)', color: '#BFB6A6' }}>
                          No address or phone on file
                        </div>
                      </div>
                      <span style={{ display: 'flex', color: '#BFB6A6' }}>
                        <Icon name="unfold_more" size={22} />
                      </span>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        height: 46,
                        padding: '0 14px',
                        border: '1.5px dashed #D8CCB6',
                        borderRadius: 14,
                        boxSizing: 'content-box',
                        font: '400 17px/1 var(--font-inter)',
                        color: '#4A443A',
                      }}
                    >
                      <span style={{ display: 'flex' }}>
                        <Icon name="person" size={22} />
                      </span>
                      {nT.s.length > 0 ? (
                        <span style={{ color: '#1E1A14' }}>
                          {nT.s}
                          <Cursor />
                        </span>
                      ) : (
                        <span>Name</span>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #EFE6D6',
                      borderRadius: 18,
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {jobFilled ? (
                      <div
                        className={styles.aPop4}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          height: 46,
                          padding: '0 14px',
                          borderRadius: 13,
                          background: '#2F2A24',
                        }}
                      >
                        <span style={{ display: 'flex', color: '#E2BC45' }}>
                          <Icon name="handyman" size={22} />
                        </span>
                        <span style={{ font: '700 16.5px/1 var(--font-montserrat)', color: '#FFF8EC', whiteSpace: 'nowrap' }}>
                          {st.job || 'Bedroom Painting'}
                        </span>
                        <span style={{ font: '400 15px/1 var(--font-inter)', color: '#BFB6A6' }}>· job</span>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          height: 46,
                          padding: '0 14px',
                          border: '1.5px dashed #D8CCB6',
                          borderRadius: 13,
                          boxSizing: 'content-box',
                          font: '400 17px/1 var(--font-inter)',
                          color: '#4A443A',
                        }}
                      >
                        <span style={{ display: 'flex' }}>
                          <Icon name="handyman" size={22} />
                        </span>
                        {jT.s.length > 0 ? (
                          <span style={{ color: '#1E1A14' }}>
                            {jT.s}
                            <Cursor />
                          </span>
                        ) : (
                          <span>Product/Service</span>
                        )}
                      </div>
                    )}

                    {st.suggest && (
                      <div
                        data-spot="suggest"
                        className={styles.aCardIn}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 12,
                          background: '#FAF2E6',
                          border: '1px solid #E8DDC8',
                        }}
                      >
                        <span style={{ display: 'flex', color: '#B8960F' }}>
                          <BookmarkIcon size={20} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '600 15px/1.2 var(--font-inter)' }}>Bedroom Painting</div>
                          <div style={{ font: '400 12.5px/1.3 var(--font-inter)', color: '#6B6458' }}>Saved service</div>
                        </div>
                        <span style={{ font: '700 15px/1 var(--font-montserrat)' }}>$400.00</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          padding: 4,
                          borderRadius: 12,
                          background: '#F1E9DC',
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            textAlign: 'center',
                            color: '#B3AA99',
                            display: 'flex',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon name="remove" size={20} />
                        </span>
                        <span
                          style={{
                            width: 34,
                            height: 32,
                            borderRadius: 9,
                            background: '#fff',
                            display: 'grid',
                            placeItems: 'center',
                            font: '500 16px/1 var(--font-inter)',
                            color: '#8D8576',
                          }}
                        >
                          1
                        </span>
                        <span
                          style={{
                            width: 28,
                            textAlign: 'center',
                            color: '#2F2A24',
                            display: 'flex',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon name="add" size={20} />
                        </span>
                      </div>
                      <span style={{ color: '#8D8576', fontSize: 15 }}>×</span>
                      {priceFilled ? (
                        <span
                          data-spot="tplPrice"
                          className={styles.aPrice}
                          style={{
                            display: 'block',
                            height: 40,
                            padding: '0 12px',
                            borderRadius: 11,
                            background: '#2F2A24',
                            color: '#FFF8EC',
                            font: '700 16px/40px var(--font-montserrat)',
                          }}
                        >
                          $400.00
                        </span>
                      ) : (
                        <span
                          data-spot="tplPrice"
                          style={{
                            height: 40,
                            padding: '0 12px',
                            border: '1.5px dashed #D8CCB6',
                            borderRadius: 11,
                            boxSizing: 'content-box',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            font: '400 16px/1 var(--font-inter)',
                            color: '#4A443A',
                          }}
                        >
                          $
                          {pT.s.length > 0 ? (
                            <span style={{ color: '#1E1A14' }}>
                              {pT.s}
                              <Cursor />
                            </span>
                          ) : (
                            <span>Price</span>
                          )}
                        </span>
                      )}
                      <span
                        style={{
                          marginLeft: 'auto',
                          font: '700 17px/1 var(--font-montserrat)',
                          color: state.lineColor,
                        }}
                      >
                        {state.lineTotal}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', font: '700 16px/1 var(--font-inter)', color: '#6E5800' }}>
                    <span style={{ display: 'flex' }}>
                      <Icon name="add" size={22} />
                    </span>
                    Add item
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', font: '700 16px/1 var(--font-inter)', color: '#6E5800' }}>
                    <span style={{ display: 'flex' }}>
                      <Icon name="add" size={22} />
                    </span>
                    Add attachment
                  </div>
                  <div
                    style={{
                      height: 44,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0 14px',
                      border: '1.5px dashed #D8CCB6',
                      borderRadius: 14,
                      boxSizing: 'content-box',
                      font: '400 16px/1 var(--font-inter)',
                      color: '#4A443A',
                    }}
                  >
                    <span style={{ display: 'flex' }}>
                      <Icon name="add" size={22} />
                    </span>
                    Add tax
                  </div>
                  <div
                    style={{
                      height: 44,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0 14px',
                      border: '1.5px dashed #D8CCB6',
                      borderRadius: 14,
                      boxSizing: 'content-box',
                      font: '400 16px/1 var(--font-inter)',
                      color: '#4A443A',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ display: 'flex' }}>
                      <Icon name="sticky_note_2" size={22} />
                    </span>
                    Extra info<span style={{ color: '#8D8576' }}>· dates, notes, deposit</span>
                  </div>
                  <div style={{ height: 1, background: '#E6DCCB' }} />
                  <div data-spot="invFoot" style={{ borderRadius: 16 }}>
                    {footFilled ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          minHeight: 54,
                        }}
                      >
                        <div>
                          <div style={{ font: '400 14px/1.2 var(--font-inter)', color: '#4A443A' }}>
                            Subtotal {state.totalStr}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                            <span style={{ font: '400 15px/1 var(--font-inter)', color: '#4A443A' }}>Total</span>
                            <span
                              style={{
                                font: '800 26px/1 var(--font-montserrat)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {state.totalStr}
                            </span>
                          </div>
                        </div>
                        <span
                          className={styles.aPop4}
                          style={{
                            flex: 'none',
                            width: 52,
                            height: 52,
                            borderRadius: 26,
                            background: '#2F2A24',
                            color: '#FFF8EC',
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <Icon name="north_east" size={26} />
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          minHeight: 54,
                        }}
                      >
                        <div style={{ font: '400 15px/1.3 var(--font-inter)', color: '#4A443A' }}>
                          Add a client and an item to send
                        </div>
                        <span
                          style={{
                            flex: 'none',
                            width: 52,
                            height: 52,
                            borderRadius: 26,
                            background: '#EDE6DA',
                            color: '#B3AA99',
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <Icon name="north_east" size={26} />
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                ))}

              {st.exp &&
                (laptop ? (
                  <LaptopExpenseCard state={state} />
                ) : (
                <div
                  className={styles.aCardIn6}
                  style={{
                    margin: '0 12px',
                    padding: 18,
                    background: '#FAF2E6',
                    border: '1.5px solid #EADBB4',
                    borderRadius: 26,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ font: '800 14px/1 var(--font-montserrat)', letterSpacing: '.16em', color: '#6E5800' }}>
                        EXPENSE
                      </div>
                      <div style={{ marginTop: 6, font: '400 14px/1 var(--font-inter)', color: '#4A443A' }}>
                        From your receipt
                      </div>
                    </div>
                    <span style={{ display: 'flex', color: '#2F2A24' }}>
                      <Icon name="close" size={24} />
                    </span>
                  </div>
                  <div
                    style={{
                      font: '800 46px/1 var(--font-montserrat)',
                      letterSpacing: '-.01em',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {state.expAmt}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div
                      style={{
                        flex: 1,
                        paddingBottom: 7,
                        borderBottom: '1.5px dashed #CFC5B3',
                        font: '400 18px/1 var(--font-inter)',
                        color: '#8D8576',
                      }}
                    >
                      <span style={{ color: '#2F2A24', fontWeight: 500 }}>at</span> Fuel Stop
                    </div>
                    <span
                      style={{
                        height: 42,
                        padding: '0 16px',
                        borderRadius: 21,
                        background: '#fff',
                        border: '1.5px solid #D8CDB9',
                        boxSizing: 'content-box',
                        display: 'flex',
                        alignItems: 'center',
                        font: '600 15px/1 var(--font-inter)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Oct 25, 2026
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
                    {['Food', 'Fuel', 'Supplies', 'Tools'].map((cat) => {
                      const fuel = cat === 'Fuel' && st.fuel;
                      return (
                        <span
                          key={cat}
                          className={fuel ? styles.aPop4 : undefined}
                          style={{
                            height: 46,
                            borderRadius: 12,
                            border: fuel ? '2px solid #D4AF37' : '1.5px solid #8F877A',
                            boxSizing: 'content-box',
                            background: fuel ? '#F6EBD3' : '#fff',
                            boxShadow: fuel ? '0 0 0 3px #F6EBD3,0 0 0 4.5px #D4AF37' : undefined,
                            display: 'grid',
                            placeItems: 'center',
                            font: `${fuel ? 700 : 600} 15px/1 var(--font-inter)`,
                          }}
                        >
                          {cat}
                        </span>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      height: 50,
                      borderRadius: 14,
                      background: '#F3EBDD',
                      border: '1px solid #E6DCCB',
                      boxSizing: 'content-box',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0 14px',
                      font: '400 16px/1 var(--font-inter)',
                      color: '#8D8576',
                    }}
                  >
                    <span style={{ display: 'flex' }}>
                      <Icon name="edit" size={20} />
                    </span>
                    Add what you bought (optional)
                  </div>
                  {st.saved ? (
                    <div
                      data-spot="saveExpense"
                      className={styles.aPop4}
                      style={{
                        height: 54,
                        borderRadius: 27,
                        background: '#2F2A24',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        font: '700 18px/1 var(--font-inter)',
                        color: '#FFF8EC',
                      }}
                    >
                      <span style={{ display: 'flex', color: '#E2BC45' }}>
                        <Icon name="check" size={24} />
                      </span>
                      Saved to Books
                    </div>
                  ) : (
                    <div
                      data-spot="saveExpense"
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
                      <span style={{ display: 'flex' }}>
                        <Icon name="check_circle" size={24} />
                      </span>
                      Save expense
                    </div>
                  )}
                  <div
                    style={{
                      textAlign: 'center',
                      font: '500 16px/1 var(--font-inter)',
                      color: '#2F2A24',
                      textDecoration: 'underline',
                      textUnderlineOffset: 4,
                    }}
                  >
                    Change something
                  </div>
                </div>
                ))}

              {st.ready &&
                (laptop ? (
                  <LaptopReadyCard state={state} />
                ) : (
                <div
                  className={styles.aCardIn55}
                  style={{
                    margin: '0 12px',
                    padding: 18,
                    background: '#FAF2E6',
                    border: '1.5px solid #EADBB4',
                    borderRadius: 26,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      font: '800 15px/1 var(--font-montserrat)',
                      letterSpacing: '.06em',
                      color: '#6E5800',
                    }}
                  >
                    <span style={{ display: 'flex' }}>
                      <Icon name="description" size={22} />
                    </span>
                    ESTIMATE FOR BRANDON
                  </div>
                  <span
                    data-spot="readyChip"
                    style={{
                      alignSelf: 'flex-start',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      height: 34,
                      padding: '0 14px 0 12px',
                      borderRadius: 17,
                      background: '#EFE8DC',
                      font: '600 15px/1 var(--font-inter)',
                      color: '#2F2A24',
                    }}
                  >
                    <span style={{ display: 'flex' }}>
                      <Icon name="lock" size={18} filled />
                    </span>
                    Ready to share
                  </span>
                  <div
                    style={{
                      background: '#FFFDF8',
                      border: '1px solid #EFE6D6',
                      borderRadius: 16,
                      padding: '14px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ font: '500 18px/1.2 var(--font-inter)' }}>
                        <Mono size={18} weight={500} lineHeight={1.2} color="#8D8576">
                          <span style={{ marginRight: 8 }}>1.</span>
                        </Mono>
                        Fence Repair
                      </div>
                      <div style={{ margin: '5px 0 0 26px', font: '400 15px/1 var(--font-inter)', color: '#4A443A' }}>
                        1 job × $400.00
                      </div>
                    </div>
                    <div style={{ font: '800 17px/1.2 var(--font-montserrat)' }}>$400.00</div>
                  </div>
                  <div style={{ height: 1, background: '#E6DCCB' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ font: '600 15px/1 var(--font-inter)', color: '#3E3830' }}>Deposit required</span>
                    <span
                      style={{
                        width: 120,
                        height: 44,
                        borderRadius: 12,
                        background: '#FFFDF8',
                        border: '1px solid #E6DCCB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 10px 0 14px',
                        boxSizing: 'border-box',
                        font: '500 15px/1 var(--font-inter)',
                        color: '#6B6458',
                      }}
                    >
                      None
                      <span style={{ display: 'flex' }}>
                        <Icon name="unfold_more" size={18} />
                      </span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ font: '600 15px/1 var(--font-inter)', color: '#3E3830' }}>Tax</span>
                    <span
                      style={{
                        height: 40,
                        padding: '0 14px',
                        borderRadius: 12,
                        background: '#FFFDF8',
                        border: '1px solid #EFE6D6',
                        boxSizing: 'content-box',
                        font: '600 14px/40px var(--font-inter)',
                        color: '#9A8434',
                      }}
                    >
                      + Add tax
                    </span>
                  </div>
                  <div>
                    <div style={{ font: '600 15px/1 var(--font-inter)', color: '#3E3830', marginBottom: 8 }}>Notes</div>
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: '#FFFDF8',
                        border: '1px solid #EFE6D6',
                        font: '400 14px/1.4 var(--font-inter)',
                        color: '#A39B8D',
                      }}
                    >
                      Deposit due before materials are ordered. 3-5 day lead time.
                    </div>
                  </div>
                  <div style={{ height: 1, background: '#E6DCCB' }} />
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ font: '700 14px/1 var(--font-inter)', letterSpacing: '.1em', color: '#3E3830' }}>
                      ESTIMATE TOTAL
                    </span>
                    <span style={{ font: '800 38px/1 var(--font-montserrat)' }}>$400.00</span>
                  </div>
                  <div style={{ height: 1, background: '#E6DCCB' }} />
                  <div style={{ textAlign: 'center', font: '400 15.5px/1.3 var(--font-inter)', color: '#2F2A24' }}>
                    Copy or share the link with Brandon.
                  </div>
                  <div style={{ font: '400 14px/1.4 var(--font-inter)', color: '#2F2A24' }}>
                    https://onit.app/e/sample-estimate
                  </div>
                  <div
                    data-spot="shareBtns"
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderRadius: 16 }}
                  >
                    <div
                      data-spot="copyLink"
                      style={{
                        height: 54,
                        borderRadius: 16,
                        background: '#fff',
                        border: '1.5px solid #D8CDB9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        font: '700 16.5px/1 var(--font-inter)',
                        color: '#6E5800',
                      }}
                    >
                      {st.copied ? (
                        <span className={styles.aPop35} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon name="check" size={22} />
                          Copied
                        </span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon name="link" size={22} />
                          Copy link
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        height: 54,
                        borderRadius: 16,
                        background: '#fff',
                        border: '1.5px solid #D8CDB9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        font: '700 16.5px/1 var(--font-inter)',
                        color: '#6E5800',
                      }}
                    >
                      <span style={{ display: 'flex' }}>
                        <Icon name="share" size={22} />
                      </span>
                      Share
                    </div>
                  </div>
                  <div data-spot="revise" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 22 }}>
                    <div
                      style={{
                        height: 56,
                        borderRadius: 28,
                        background: '#D4AF37',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        font: '700 18px/1 var(--font-inter)',
                        color: '#2A2410',
                      }}
                    >
                      <span style={{ display: 'flex' }}>
                        <Icon name="edit" size={22} />
                      </span>
                      Revise
                    </div>
                    <div
                      style={{
                        textAlign: 'center',
                        font: '400 13.5px/1.4 var(--font-inter)',
                        color: '#4A443A',
                        padding: '0 6px 2px',
                      }}
                    >
                      Makes a new estimate you can edit. This one and its link stay as they are.
                    </div>
                  </div>
                </div>
                ))}
            </div>
          </div>

          {state.composerOn && (
            <div
              style={{
                position: 'absolute',
                // Laptop: this render already sits inside the 1152 content area,
                // so centring the 44 + 8 + 612 + 8 + 44 row here puts the composer
                // at the design's x, 44 tall.
                left: 0,
                right: 0,
                bottom: 0,
                height: laptop ? 80 : 72,
                borderTop: laptop ? '1px solid #F0E7D8' : '1px solid #E8DFD0',
                background: laptop ? 'transparent' : '#FDF7EE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: laptop ? 'center' : 'flex-start',
                gap: laptop ? 10 : 9,
                padding: laptop ? 0 : '0 12px',
                boxSizing: 'border-box',
              }}
            >
              <span
                data-spot="plus"
                style={{
                  flex: 'none',
                  width: laptop ? 44 : 50,
                  height: laptop ? 44 : 50,
                  borderRadius: laptop ? 22 : 25,
                  background: '#F2E5BC',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#1E1A14',
                }}
              >
                <Icon name="add" size={laptop ? 26 : 30} />
              </span>
              <div
                data-spot="composer"
                style={{
                  flex: laptop ? 'none' : 1,
                  width: laptop ? 612 : undefined,
                  minWidth: 0,
                  height: laptop ? 44 : 50,
                  borderRadius: laptop ? 22 : 25,
                  background: '#fff',
                  border: '1.5px solid #CFC5B3',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 4px 0 16px',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    direction: 'rtl',
                    textAlign: 'left',
                    font: '400 16.5px/1.3 var(--font-inter)',
                  }}
                >
                  {comp.s.length > 0 ? (
                    <span style={{ direction: 'ltr', unicodeBidi: 'isolate', color: '#1E1A14' }}>
                      {comp.s}
                      <Cursor />
                    </span>
                  ) : (
                    <span style={{ direction: 'ltr', unicodeBidi: 'isolate', color: '#9A9286' }}>
                      Message On It...
                    </span>
                  )}
                </div>
                <span style={{ display: 'flex', color: '#2F2A24' }}>
                  <Icon name="image" size={24} />
                </span>
                {/* Design: a 36 tile (radius 18) with a 20px glyph, centred in the
                    44 row and 4 off the composer's right edge through its padding. */}
                <span
                  data-spot="camera"
                  style={{
                    flex: 'none',
                    width: laptop ? 36 : 40,
                    height: laptop ? 36 : 40,
                    borderRadius: laptop ? 18 : 20,
                    background: '#F2E5BC',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#1E1A14',
                  }}
                >
                  <Icon name="photo_camera" size={laptop ? 20 : 22} />
                </span>
              </div>
              <span
                data-spot="send"
                style={{
                  flex: 'none',
                  width: laptop ? 44 : 50,
                  height: laptop ? 44 : 50,
                  borderRadius: laptop ? 22 : 25,
                  background: state.sendBg,
                  color: state.sendFg,
                  display: 'grid',
                  placeItems: 'center',
                  transition: 'background .3s,color .3s',
                }}
              >
                <Icon name="arrow_upward" size={26} />
              </span>
            </div>
          )}
        </div>

        {st.menu && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
            <div className={styles.aFade3} style={{ position: 'absolute', inset: 0, background: 'rgba(253,247,238,.88)' }} />
            <div
              style={{
                position: 'absolute',
                left: 12,
                bottom: 166,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              {[
                { icon: 'mic' as const, title: 'Voice', sub: 'Say it, On It writes it', tile: '#F2E5BC', cls: styles.aMenu15, spot: undefined },
                { icon: 'description' as const, title: 'New invoice', sub: 'Guided template', tile: '#D4AF37', cls: styles.aMenu1, spot: 'menuInvoice' },
                { icon: 'request_quote' as const, title: 'New estimate', sub: 'Guided template', tile: '#F2E5BC', cls: styles.aMenu05, spot: undefined },
                { icon: 'receipt_long' as const, title: 'Record expense', sub: 'Guided template', tile: '#F2E5BC', cls: styles.aMenu0, spot: undefined },
              ].map((item) => (
                <div
                  key={item.title}
                  data-spot={item.spot}
                  className={item.cls}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '7px 26px 7px 7px',
                    borderRadius: 34,
                    background: '#fff',
                    border: '1.5px solid #DCD2C0',
                    boxShadow: '0 10px 30px -14px rgba(60,45,10,.3)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 23,
                      background: item.tile,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#1E1A14',
                    }}
                  >
                    <Icon name={item.icon} size={24} />
                  </span>
                  <div>
                    <div style={{ font: '700 18px/1.2 var(--font-inter)' }}>{item.title}</div>
                    <div style={{ font: '400 14.5px/1.3 var(--font-inter)', color: '#3E3830' }}>{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 84,
                height: 72,
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '0 12px',
                boxSizing: 'border-box',
                borderTop: '1px solid #E8DFD0',
                background: '#FDF7EE',
              }}
            >
              <span
                style={{
                  flex: 'none',
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  background: '#2F2A24',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon name="close" size={28} />
              </span>
              <div
                style={{
                  flex: 1,
                  height: 50,
                  borderRadius: 25,
                  background: '#fff',
                  border: '1.5px solid #CFC5B3',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 4px 0 16px',
                  boxSizing: 'border-box',
                  font: '400 16.5px/1 var(--font-inter)',
                  color: '#9A9286',
                }}
              >
                <span style={{ flex: 1 }}>Message On It...</span>
                <span style={{ display: 'flex', color: '#2F2A24' }}>
                  <Icon name="image" size={24} />
                </span>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    background: '#F2E5BC',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#1E1A14',
                  }}
                >
                  <Icon name="photo_camera" size={22} />
                </span>
              </div>
              <span
                style={{
                  flex: 'none',
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  background: '#EAE3D7',
                  color: '#A49B8D',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon name="arrow_upward" size={26} />
              </span>
            </div>
          </div>
        )}

        {st.flash && (
          <div
            className={styles.aFlash}
            style={{ position: 'absolute', inset: 0, zIndex: 40, background: '#fff', pointerEvents: 'none' }}
          />
        )}
      </MockChrome>
    </div>
  );
}
