import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import type { SceneState } from '../player-state';
import styles from '../tutorial.module.css';
import { MockChrome } from './MockChrome';

// Ported 1:1 from On It Tutorials.html — screens settings, pay, biz, brand.
// The prototype's fourth settings scene ('Turn on alerts', screen `notif`) is
// deliberately not ported: it is absent from data.ts.

const MONO = 'var(--font-plex-mono), monospace';

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

function GroupLabel({ children, top }: { children: React.ReactNode; top: number }) {
  return (
    <div
      style={{
        margin: `${top}px 0 10px 4px`,
        font: '700 13px/1 var(--font-montserrat)',
        letterSpacing: '.12em',
        color: '#3E3830',
      }}
    >
      {children}
    </div>
  );
}

function SettingsRow({
  icon,
  tile,
  label,
  value,
  spot,
  last,
}: {
  icon?: IconName;
  tile?: React.ReactNode;
  label: string;
  value?: string;
  spot?: string;
  last?: boolean;
}) {
  return (
    <div
      data-spot={spot}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        height: 54,
        padding: '0 16px',
        borderBottom: last ? undefined : '1px solid #EEE6D8',
      }}
    >
      {tile ?? (
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: '#F1EADF',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {icon && <Icon name={icon} size={20} />}
        </span>
      )}
      <span style={{ flex: 1, font: '400 17px/1 var(--font-inter)' }}>{label}</span>
      {value && <span style={{ font: '400 16px/1 var(--font-inter)', color: '#3E3830' }}>{value}</span>}
      <span style={{ color: '#4A443A', display: 'flex' }}>
        <Icon name="chevron_right" size={20} />
      </span>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 22,
        background: '#fff',
        border: '1.5px solid #E6DCCB',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

// ─── settings ───────────────────────────────────────────────────────────────
function SettingsScreen() {
  const billing = (
    <span
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: '#F2E5BC',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Icon name="group" size={20} />
    </span>
  );
  const services = (
    <span
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: '#F2E5BC',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Icon name="handyman" size={20} />
    </span>
  );
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
        padding: '18px 16px 0',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ font: '800 32px/1 var(--font-montserrat)', paddingLeft: 4 }}>Settings</div>
      <GroupLabel top={24}>YOUR BUSINESS</GroupLabel>
      <Card>
        <SettingsRow tile={billing} label="Clients" value="1" />
        <SettingsRow tile={services} label="Products & Services" value="1" />
        <SettingsRow icon="storefront" label="Business profile" />
        <SettingsRow icon="folder" label="Records" value="Vault" last />
      </Card>
      <GroupLabel top={22}>MONEY</GroupLabel>
      <Card>
        <SettingsRow icon="autorenew" label="Recurring expenses" value="In Books" />
        <SettingsRow icon="account_balance" label="Payment options" value="Set up" spot="paymentRow" last />
      </Card>
      <GroupLabel top={22}>ACCOUNT</GroupLabel>
      <Card>
        <SettingsRow icon="workspace_premium" label="Plan" value="Founder" />
        <SettingsRow icon="notifications" label="Notifications" value="Off" spot="notifRow" last />
      </Card>
    </div>
  );
}

// ─── pay ────────────────────────────────────────────────────────────────────
function PayScreen() {
  const letter = (text: string, style?: React.CSSProperties) => (
    <span
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: '#F1EADF',
        display: 'grid',
        placeItems: 'center',
        ...style,
      }}
    >
      {text}
    </span>
  );
  const single = (spot: string, icon: IconName, label: string, value: string, delay: string) => (
    <div
      data-spot={spot}
      className={delay}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        height: 56,
        padding: '0 16px',
        borderRadius: 22,
        background: '#fff',
        border: '1.5px solid #E6DCCB',
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: '#F1EADF',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name={icon} size={20} />
      </span>
      <span style={{ flex: 1, font: '400 17px/1 var(--font-inter)' }}>{label}</span>
      <span style={{ font: '400 15px/1 var(--font-inter)', color: '#3E3830' }}>{value}</span>
      <span style={{ color: '#4A443A', display: 'flex' }}>
        <Icon name="chevron_right" size={20} />
      </span>
    </div>
  );
  const appRow = (
    tile: React.ReactNode,
    label: string,
    value: string,
    last?: boolean
  ) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        height: 54,
        padding: '0 16px',
        borderBottom: last ? undefined : '1px solid #EEE6D8',
      }}
    >
      {tile}
      <span style={{ flex: 1, font: '400 17px/1 var(--font-inter)' }}>{label}</span>
      <span style={{ font: '400 15px/1 var(--font-inter)', color: '#3E3830' }}>{value}</span>
      <span style={{ color: '#4A443A', display: 'flex' }}>
        <Icon name="chevron_right" size={20} />
      </span>
    </div>
  );
  const tileBase: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: '#F1EADF',
    display: 'grid',
    placeItems: 'center',
  };
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
        padding: '18px 16px 0',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ font: '800 32px/1 var(--font-montserrat)', paddingLeft: 4 }}>Payment options</div>
      <div style={{ margin: '12px 4px 0', font: '400 15.5px/1.45 var(--font-inter)', color: '#3E3830' }}>
        Choose how clients can pay you. Everything you set here shows on your pay page.
      </div>
      <GroupLabel top={20}>GET PAID ONLINE</GroupLabel>
      {single('payCard', 'credit_card', 'Card & digital wallets', 'Not connected', styles.aPayCard)}
      <GroupLabel top={20}>BANK</GroupLabel>
      {single('payBank', 'account_balance', 'Bank transfer', 'Not set', styles.aPayBank)}
      <GroupLabel top={20}>PAYMENT APPS</GroupLabel>
      <div
        data-spot="payApps"
        className={styles.aPayApps}
        style={{
          borderRadius: 22,
          background: '#fff',
          border: '1.5px solid #E6DCCB',
          overflow: 'hidden',
        }}
      >
        {appRow(
          <span style={{ ...tileBase, font: '800 18px/1 var(--font-montserrat)', color: '#6D1ED4' }}>Z</span>,
          'Zelle',
          'Not set'
        )}
        {appRow(
          <span style={tileBase}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: '#00C244',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                font: '800 15px/1 var(--font-montserrat)',
              }}
            >
              $
            </span>
          </span>,
          'Cash App',
          'Not set'
        )}
        {appRow(
          <span
            style={{ ...tileBase, font: '800 italic 19px/1 var(--font-montserrat)', color: '#1A3D8F' }}
          >
            P
          </span>,
          'PayPal',
          'Not set'
        )}
        {appRow(
          <span
            style={{ ...tileBase, font: '800 italic 20px/1 var(--font-montserrat)', color: '#1A7CE0' }}
          >
            V
          </span>,
          'Venmo',
          'Not set',
          true
        )}
      </div>
    </div>
  );
}

// ─── biz ────────────────────────────────────────────────────────────────────
function BizScreen({ state }: { state: SceneState }) {
  const { ph, em, tm } = state;
  const field = (spot: string | undefined, typed: string, placeholder: string, cur: boolean) => (
    <div
      data-spot={spot}
      style={{
        height: 52,
        borderRadius: 14,
        background: '#F4ECDF',
        border: '1.5px solid #EADBB8',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        font: '400 17px/1 var(--font-inter)',
      }}
    >
      {typed ? (
        <span>
          {typed}
          {cur && <Cursor />}
        </span>
      ) : (
        <span style={{ color: '#8D8576' }}>{placeholder}</span>
      )}
    </div>
  );
  const filled = (text: string) => (
    <div
      style={{
        height: 52,
        borderRadius: 14,
        background: '#F4ECDF',
        border: '1.5px solid #EADBB8',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        font: '400 17px/1 var(--font-inter)',
      }}
    >
      {text}
    </div>
  );
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
        padding: '18px 16px 0',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ font: '800 32px/1 var(--font-montserrat)', paddingLeft: 4 }}>Business Info</div>
      <div
        style={{
          marginTop: 18,
          padding: '18px 16px',
          borderRadius: 24,
          background: '#FAF2E6',
          border: '1.5px solid #EDE3D1',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            font: '700 14px/1 var(--font-inter)',
            letterSpacing: '.1em',
            color: '#3E3830',
            marginBottom: 4,
          }}
        >
          BUSINESS
        </div>
        <div data-spot="bizTop" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderRadius: 14 }}>
          {filled('Sample Painting Co.')}
          {filled('example.com')}
          {filled('Quality work, on time.')}
        </div>
        {field('bizPhone', ph.s, 'Business phone', ph.cur)}
        {field('bizEmail', em.s, 'Business email', em.cur)}
        <div data-spot="bizTerms" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 14 }}>
          <div
            style={{
              height: 104,
              borderRadius: 14,
              background: '#F4ECDF',
              border: '1.5px solid #EADBB8',
              padding: '12px 16px',
              boxSizing: 'border-box',
              font: '400 16px/1.45 var(--font-inter)',
            }}
          >
            {tm.s ? (
              <span>
                {tm.s}
                {tm.cur && <Cursor />}
              </span>
            ) : (
              <span style={{ color: '#8D8576' }}>
                Terms and conditions (printed on every estimate and invoice)
              </span>
            )}
          </div>
          <div style={{ textAlign: 'right', font: '400 14px/1 var(--font-inter)', color: '#4A443A' }}>
            {tm.s.length}/3000
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── brand ──────────────────────────────────────────────────────────────────
function BrandScreen({ state }: { state: SceneState }) {
  const { st, styleName } = state;
  const friendly = st.style === 'friendly';
  return (
    <div
      className={styles.aSlideIn}
      style={{ position: 'absolute', top: 103, left: 0, right: 0, bottom: 84, overflow: 'hidden' }}
    >
      <div
        style={{
          padding: '18px 16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          transform: `translateY(${st.brandScroll ? -150 : 0}px)`,
          transition: 'transform 1s cubic-bezier(.65,0,.35,1)',
        }}
      >
        <div style={{ font: '800 32px/1 var(--font-montserrat)', paddingLeft: 4 }}>Brand Design</div>

        <div
          style={{
            padding: 18,
            borderRadius: 24,
            background: '#FAF2E6',
            border: '1.5px solid #EDE3D1',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ font: '600 14px/1 var(--font-inter)', letterSpacing: '.1em', color: '#3E3830' }}>
            LOGO
          </div>
          <div data-spot="logo" style={{ display: 'flex', alignItems: 'center', gap: 14, borderRadius: 16 }}>
            <span
              style={{
                flex: 'none',
                width: 64,
                height: 64,
                borderRadius: 14,
                background: 'repeating-linear-gradient(135deg,#E9E2D6 0 6px,#E1D9CB 6px 12px)',
                border: '1px solid #D9CFBD',
                display: 'grid',
                placeItems: 'center',
                font: `600 10px/1 ${MONO}`,
                letterSpacing: '.08em',
                color: '#6B6458',
              }}
            >
              LOGO
            </span>
            <span style={{ font: '400 16px/1.3 var(--font-inter)', color: '#3E3830' }}>
              Shown on your invoices.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['upload', 'delete'] as const).map((icon) => (
              <span
                key={icon}
                style={{
                  height: 48,
                  padding: '0 18px',
                  borderRadius: 12,
                  background: '#fff',
                  border: '1.5px solid #8F877A',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  font: '700 16px/1 var(--font-inter)',
                  letterSpacing: '.02em',
                }}
              >
                <Icon name={icon} size={20} />
                {icon === 'upload' ? 'Replace' : 'Remove'}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: 18,
            borderRadius: 24,
            background: '#FAF2E6',
            border: '1.5px solid #EDE3D1',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ font: '600 14px/1 var(--font-inter)', letterSpacing: '.1em', color: '#3E3830' }}>
              INVOICE STYLE
            </span>
            <span style={{ font: '400 15px/1 var(--font-inter)', color: '#3E3830' }}>{styleName}</span>
          </div>
          <div style={{ font: '600 13px/1 var(--font-inter)', letterSpacing: '.1em', color: '#6B6458' }}>
            TEMPLATE
          </div>
          <div
            data-spot="templates"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderRadius: 18 }}
          >
            <TemplateCard
              title="Classic"
              sub="Serif, timeless"
              selected={!friendly}
              bg={friendly ? '#fff' : '#FAF0CF'}
              bd={friendly ? '#E6DCCB' : '#D4AF37'}
              dot={!friendly}
            />
            <TemplateCard title="Ledger" sub="Mono figures" selected={false} />
            <TemplateCard title="Industrial" sub="Bold, blocky" selected={false} />
            <TemplateCard
              spot="tplFriendly"
              title="Friendly"
              sub="Rounded, warm"
              selected={friendly}
              bg={friendly ? '#FAF0CF' : '#fff'}
              bd={friendly ? '#D4AF37' : '#E6DCCB'}
              dot={friendly}
            />
          </div>

          <div
            data-spot="colors"
            style={{
              padding: 16,
              borderRadius: 20,
              background: '#F7F0E4',
              border: '1px solid #EADFCC',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ font: '600 14px/1 var(--font-inter)', letterSpacing: '.1em', color: '#3E3830' }}>
                COLORS
              </span>
              <span style={{ font: '600 15px/1 var(--font-inter)', color: '#1E7A3C' }}>3 of 3 picked</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 16 }}>
              <Swatch color="#2B2925" role="Background" name="Charcoal" />
              <Swatch color="#5B6B7A" role="Accent" name="Slate" />
              <Swatch color="#C9C3B8" role="Secondary" name="Stone" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  title,
  sub,
  selected,
  bg = '#fff',
  bd = '#E6DCCB',
  dot = false,
  spot,
}: {
  title: string;
  sub: string;
  selected: boolean;
  bg?: string;
  bd?: string;
  dot?: boolean;
  spot?: string;
}) {
  return (
    <div
      data-spot={spot}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 14px',
        borderRadius: 16,
        background: bg,
        border: `2px solid ${selected ? bd : '#E6DCCB'}`,
        transition: 'all .35s',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ font: '700 17px/1.2 var(--font-inter)' }}>{title}</div>
        <div style={{ font: '400 13.5px/1.3 var(--font-inter)', color: '#4A443A' }}>{sub}</div>
      </div>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          border: `2px solid ${selected ? bd : '#CFC5B3'}`,
          boxSizing: 'border-box',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {dot && (
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: '#D4AF37',
              opacity: dot ? 1 : 0,
              transition: 'opacity .3s',
            }}
          />
        )}
      </span>
    </div>
  );
}

function Swatch({ color, role, name }: { color: string; role: string; name: string }) {
  return (
    <div>
      <div style={{ height: 34, borderRadius: 10, background: color }} />
      <div style={{ marginTop: 8, font: '400 13px/1 var(--font-inter)', color: '#4A443A' }}>{role}</div>
      <div style={{ marginTop: 4, font: '700 15px/1 var(--font-inter)' }}>{name}</div>
    </div>
  );
}

// ─── Laptop (xl) ────────────────────────────────────────────────────────────
// The design's laptop Settings screen: a `masterCol` list pane (the design keys it
// on its frame — 440 at >=1440, else 392; the app's stage is 1380, so 392) and the
// open pane on the right. The design's own `setPane` falls back to Business Info
// when the screen is the list, so the right pane always has something in it. The
// tour's four panes are pay / biz / brand (its `notif` pane has no scene in
// data.ts, so it is not ported — same as the phone mock). Values are the export's
// (design/laptop/tutorial.html, MAPPING §14).
const selBg = (on: boolean) => (on ? '#f3e9c8' : 'transparent');

function LaptopGroupLabel({ children, top = 20 }: { children: React.ReactNode; top?: number }) {
  return (
    <div
      style={{
        margin: `${top}px 0 8px 4px`,
        font: '700 12px/1 var(--font-montserrat)',
        letterSpacing: '.12em',
        color: '#4d4635',
      }}
    >
      {children}
    </div>
  );
}

function LaptopSettingsRow({
  icon,
  label,
  value,
  spot,
  last,
  bg,
  tile = '#f5eddf',
  chevron = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  spot?: string;
  last?: boolean;
  bg?: string;
  tile?: string;
  chevron?: boolean;
}) {
  return (
    <div
      data-spot={spot}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, height: 48, padding: '0 14px',
        borderBottom: last ? undefined : '1px solid #f0e7d8', background: bg,
      }}
    >
      <span
        style={{ width: 32, height: 32, borderRadius: 9, background: tile, display: 'grid', placeItems: 'center' }}
      >
        <Icon name={icon} size={18} />
      </span>
      <span style={{ flex: 1, font: '400 15.5px/1 var(--font-inter)' }}>{label}</span>
      <span style={{ font: '400 14px/1 var(--font-inter)', color: '#4d4635' }}>{value}</span>
      {chevron && (
        <span style={{ color: '#4d4635', display: 'flex' }}>
          <Icon name="chevron_right" size={18} />
        </span>
      )}
    </div>
  );
}

function MasterSettings({ state }: { state: SceneState }) {
  const screen = state.st.screen;
  return (
    <div style={{ borderRight: '1px solid #efe4d2', padding: '24px 20px 0 24px', overflow: 'hidden' }}>
      <div style={{ height: 40, display: 'flex', alignItems: 'center', font: '700 24px/1 var(--font-montserrat)' }}>
        Settings
      </div>
      <LaptopGroupLabel>YOUR BUSINESS</LaptopGroupLabel>
      <div style={{ borderRadius: 18, background: '#fff', border: '1px solid #efe4d2', overflow: 'hidden' }}>
        <LaptopSettingsRow icon="group" label="Clients" value="1" tile="#f0e3b8" />
        <LaptopSettingsRow icon="handyman" label="Products &amp; Services" value="1" tile="#f0e3b8" />
        <LaptopSettingsRow
          icon="storefront"
          label="Business profile"
          value=""
          chevron
          bg={selBg(screen === 'biz')}
        />
        <LaptopSettingsRow icon="folder" label="Records" value="Vault" last bg={selBg(screen === 'brand')} />
      </div>
      <LaptopGroupLabel top={18}>MONEY</LaptopGroupLabel>
      <div style={{ borderRadius: 18, background: '#fff', border: '1px solid #efe4d2', overflow: 'hidden' }}>
        <LaptopSettingsRow icon="autorenew" label="Recurring expenses" value="In Books" tile="#f5eddf" />
        <LaptopSettingsRow
          icon="account_balance"
          label="Payment options"
          value="Set up"
          chevron
          last
          spot="paymentRow"
          bg={selBg(screen === 'pay')}
        />
      </div>
      <LaptopGroupLabel top={18}>ACCOUNT</LaptopGroupLabel>
      <div style={{ borderRadius: 18, background: '#fff', border: '1px solid #efe4d2', overflow: 'hidden' }}>
        <LaptopSettingsRow icon="workspace_premium" label="Plan" value="Founder" tile="#f5eddf" />
        <LaptopSettingsRow
          icon="notifications"
          label="Notifications"
          value="Off"
          chevron
          spot="notifRow"
        />
        <LaptopSettingsRow icon="help" label="How On It works" value="" chevron last />
      </div>
    </div>
  );
}

function PaneTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: 40, display: 'flex', alignItems: 'center', font: '700 24px/1 var(--font-montserrat)' }}>
      {children}
    </div>
  );
}

function LaptopPayPane() {
  const tile = (bg: string, content: React.ReactNode) => (
    <span
      style={{ width: 32, height: 32, borderRadius: 9, background: bg, display: 'grid', placeItems: 'center' }}
    >
      {content}
    </span>
  );
  const method = (spot: string, icon: IconName, label: string, value: string, anim: string) => (
    <div
      data-spot={spot}
      className={anim}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px',
        borderRadius: 18, background: '#fff', border: '1px solid #efe4d2',
      }}
    >
      {tile('#f5eddf', <Icon name={icon} size={18} />)}
      <span style={{ flex: 1, font: '400 15.5px/1 var(--font-inter)' }}>{label}</span>
      <span style={{ font: '400 14px/1 var(--font-inter)', color: '#4d4635' }}>{value}</span>
      <span style={{ display: 'flex' }}>
        <Icon name="chevron_right" size={18} />
      </span>
    </div>
  );
  const app = (letter: string, color: string, label: string, boxed = false, last?: boolean, bottom = true) => (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px',
        borderBottom: last ? undefined : '1px solid #f0e7d8',
        borderRight: bottom ? '1px solid #f0e7d8' : undefined,
      }}
    >
      <span
        style={{
          width: 32, height: 32, borderRadius: 9,
          background: boxed ? color : '#f5eddf', display: 'grid', placeItems: 'center',
          font: '800 16px/1 var(--font-montserrat)', color: boxed ? '#fff' : color,
        }}
      >
        {letter}
      </span>
      <span style={{ flex: 1, font: '400 15.5px/1 var(--font-inter)' }}>{label}</span>
      <span style={{ font: '400 14px/1 var(--font-inter)', color: '#4d4635' }}>Not set</span>
    </div>
  );
  return (
    <div className={styles.aSlideIn} style={{ width: '100%', maxWidth: 640 }}>
      <PaneTitle>Payment options</PaneTitle>
      <div style={{ marginTop: 8, font: '400 15px/1.45 var(--font-inter)', color: '#4d4635' }}>
        Choose how clients can pay you. Everything you set here shows on your pay page.
      </div>
      <LaptopGroupLabel>GET PAID ONLINE</LaptopGroupLabel>
      {method('payCard', 'credit_card', 'Card & digital wallets', 'Not connected', styles.aPayCard)}
      <LaptopGroupLabel top={18}>BANK</LaptopGroupLabel>
      {method('payBank', 'account_balance', 'Bank transfer', 'Not set', styles.aPayBank)}
      <LaptopGroupLabel top={18}>PAYMENT APPS</LaptopGroupLabel>
      <div
        data-spot="payApps"
        className={styles.aPayApps}
        style={{
          borderRadius: 18, background: '#fff', border: '1px solid #efe4d2', overflow: 'hidden',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
        }}
      >
        {app('Z', '#6d1ed4', 'Zelle', false, false, true)}
        {app('$', '#00c244', 'Cash App', true, false, false)}
        {app('P', '#003087', 'PayPal', false, true, true)}
        {app('V', '#008cff', 'Venmo', false, true, false)}
      </div>
    </div>
  );
}

function LaptopBizPane({ state }: { state: SceneState }) {
  const { ph, em, tm } = state;
  const fieldStyle: React.CSSProperties = {
    height: 48, borderRadius: 12, background: '#f5eddf', border: '1px solid rgba(212,175,55,.2)',
    display: 'flex', alignItems: 'center', padding: '0 14px', font: '400 16px/1 var(--font-inter)',
  };
  const field = (spot: string, typed: string, placeholder: string, cur: boolean) => (
    <div data-spot={spot} style={fieldStyle}>
      {typed ? (
        <span>
          {typed}
          {cur && <Cursor />}
        </span>
      ) : (
        <span style={{ color: '#7f7663' }}>{placeholder}</span>
      )}
    </div>
  );
  return (
    <div className={styles.aSlideIn} style={{ width: '100%', maxWidth: 640 }}>
      <PaneTitle>Business Info</PaneTitle>
      <div
        style={{
          marginTop: 16, padding: 20, borderRadius: 20, background: '#fbf3e5',
          border: '1.5px solid #efe4d2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        }}
      >
        <div
          style={{
            gridColumn: '1/-1', font: '700 13px/1 var(--font-inter)', letterSpacing: '.1em',
            color: '#4d4635', marginBottom: 4,
          }}
        >
          BUSINESS
        </div>
        <div data-spot="bizTop" style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderRadius: 12 }}>
          <div style={{ ...fieldStyle, gridColumn: '1/-1' }}>Sample Painting Co.</div>
          <div style={fieldStyle}>example.com</div>
          <div style={fieldStyle}>Quality work, on time.</div>
        </div>
        {field('bizPhone', ph.s, 'Business phone', ph.cur)}
        {field('bizEmail', em.s, 'Business email', em.cur)}
        <div data-spot="bizTerms" style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 6, borderRadius: 12 }}>
          <div
            style={{
              height: 96, borderRadius: 12, background: '#f5eddf', border: '1px solid rgba(212,175,55,.2)',
              padding: '12px 14px', boxSizing: 'border-box', font: '400 16px/1.45 var(--font-inter)',
            }}
          >
            {tm.s ? (
              <span>
                {tm.s}
                {tm.cur && <Cursor />}
              </span>
            ) : (
              <span style={{ color: '#7f7663' }}>
                Terms and conditions (printed on every estimate and invoice)
              </span>
            )}
          </div>
          <div style={{ textAlign: 'right', font: '400 13px/1 var(--font-inter)', color: '#4d4635' }}>
            {tm.s.length}/3000
          </div>
        </div>
      </div>
    </div>
  );
}

function LaptopBrandPane({ state }: { state: SceneState }) {
  const { st, styleName } = state;
  const friendly = st.style === 'friendly';
  const card: React.CSSProperties = {
    padding: '18px 20px', borderRadius: 20, background: '#fbf3e5', border: '1.5px solid #efe4d2',
  };
  const template = (title: string, sub: string, selected: boolean, spot?: string) => (
    <div
      data-spot={spot}
      style={{
        padding: '10px 12px', borderRadius: 14,
        background: selected ? '#f3e9c8' : '#fff',
        border: `2px solid ${selected ? '#d4af37' : '#efe4d2'}`,
        transition: 'all .35s',
      }}
    >
      <div style={{ font: '700 15px/1.2 var(--font-inter)' }}>{title}</div>
      <div style={{ font: '400 12.5px/1.3 var(--font-inter)', color: '#4d4635' }}>{sub}</div>
    </div>
  );
  const swatch = (color: string, role: string, name: string) => (
    <div>
      <div style={{ height: 28, borderRadius: 8, background: color }} />
      <div style={{ marginTop: 6, font: '400 12.5px/1 var(--font-inter)', color: '#4d4635' }}>{role}</div>
      <div style={{ marginTop: 3, font: '700 14px/1 var(--font-inter)' }}>{name}</div>
    </div>
  );
  return (
    <div
      className={styles.aSlideIn}
      style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <PaneTitle>Brand Design</PaneTitle>
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div data-spot="logo" style={{ display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, flex: 1 }}>
          <span
            style={{
              flex: 'none', width: 60, height: 60, borderRadius: 14,
              background: 'repeating-linear-gradient(135deg,#efe7da 0 6px,#f5eddf 6px 12px)',
              border: '1px solid #d0c5af', display: 'grid', placeItems: 'center',
              font: `600 10px/1 ${MONO}`, letterSpacing: '.08em', color: '#4d4635',
            }}
          >
            LOGO
          </span>
          <div>
            <div style={{ font: '600 13px/1 var(--font-inter)', letterSpacing: '.1em', color: '#4d4635' }}>
              LOGO
            </div>
            <div style={{ marginTop: 6, font: '400 15px/1.3 var(--font-inter)', color: '#4d4635' }}>
              Shown on your invoices.
            </div>
          </div>
        </div>
        {(['upload', 'delete'] as const).map((icon) => (
          <span
            key={icon}
            style={{
              height: 40, padding: '0 14px', borderRadius: 12, background: '#fff',
              border: '1.5px solid #7f7663', display: 'flex', alignItems: 'center', gap: 6,
              font: '700 14px/1 var(--font-inter)',
            }}
          >
            <Icon name={icon} size={18} />
            {icon === 'upload' ? 'Replace' : 'Remove'}
          </span>
        ))}
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ font: '600 13px/1 var(--font-inter)', letterSpacing: '.1em', color: '#4d4635' }}>
            INVOICE STYLE
          </span>
          <span style={{ font: '400 14px/1 var(--font-inter)', color: '#4d4635' }}>{styleName}</span>
        </div>
        <div
          data-spot="templates"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8, borderRadius: 16 }}
        >
          {template('Classic', 'Serif, timeless', !friendly)}
          {template('Ledger', 'Mono figures', false)}
          {template('Industrial', 'Bold, blocky', false)}
          {template('Friendly', 'Rounded, warm', friendly, 'tplFriendly')}
        </div>
        <div
          data-spot="colors"
          style={{ padding: '14px 16px', borderRadius: 16, background: '#fff', border: '1px solid #efe4d2' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ font: '600 13px/1 var(--font-inter)', letterSpacing: '.1em', color: '#4d4635' }}>
              COLORS
            </span>
            <span style={{ font: '600 14px/1 var(--font-inter)', color: '#0f6d31' }}>3 of 3 picked</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 12 }}>
            {swatch('#2b2925', 'Background', 'Charcoal')}
            {swatch('#5b6b7a', 'Accent', 'Slate')}
            {swatch('#c9c3b8', 'Secondary', 'Stone')}
          </div>
        </div>
      </div>
    </div>
  );
}

function LaptopSettings({ state }: { state: SceneState }) {
  const screen = state.st.screen;
  const pane = screen === 'pay' || screen === 'brand' ? screen : 'biz';
  return (
    <div
      className={styles.aScrIn}
      style={{
        position: 'absolute', inset: 0, display: 'grid',
        gridTemplateColumns: '392px minmax(0,1fr)',
      }}
    >
      <MasterSettings state={state} />
      <div
        style={{
          position: 'relative', overflow: 'hidden', padding: '24px 40px',
          display: 'flex', justifyContent: 'center',
        }}
      >
        {pane === 'pay' && <LaptopPayPane />}
        {pane === 'biz' && <LaptopBizPane state={state} />}
        {pane === 'brand' && <LaptopBrandPane state={state} />}
      </div>
    </div>
  );
}

export default function SettingsMock({ state, laptop = false }: { state: SceneState; laptop?: boolean }) {
  const screen = state.st.screen;
  const back = screen === 'pay' || screen === 'biz' || screen === 'brand';
  if (laptop) {
    // The overlay already wraps the mock in LaptopShell (288 sidebar, content area).
    return (
      <div aria-hidden className={styles.mockProtoScope}>
        <LaptopSettings state={state} />
      </div>
    );
  }
  return (
    <div aria-hidden className={styles.mockProtoScope}>
      <MockChrome hdrChat={false} hdrBack={back} tabNow="settings">
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'pay' && <PayScreen />}
        {screen === 'biz' && <BizScreen state={state} />}
        {screen === 'brand' && <BrandScreen state={state} />}
      </MockChrome>
    </div>
  );
}
