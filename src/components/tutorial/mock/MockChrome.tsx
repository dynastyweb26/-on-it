import type { ReactNode } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import type { TutorialTab } from '@/lib/tutorial-seen';
import { SignalIcon, WifiIcon } from './icons';

const TABS: { key: TutorialTab; label: string; icon: IconName }[] = [
  { key: 'clients', label: 'Clients', icon: 'group' },
  { key: 'invoices', label: 'Invoices', icon: 'description' },
  { key: 'chat', label: 'Chat', icon: 'chat_bubble' },
  { key: 'books', label: 'Books', icon: 'payments' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export function StatusBar() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 47,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 30px 0 40px',
        boxSizing: 'border-box',
        zIndex: 6,
        font: '600 16px/1 var(--font-inter)',
        color: '#1E1A14',
        background: '#FDF7EE',
      }}
    >
      <span>9:41</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <SignalIcon size={18} />
        <WifiIcon size={18} />
        <span
          style={{
            width: 24,
            height: 12,
            border: '1.5px solid #1E1A14',
            borderRadius: 4,
            padding: 1.5,
            boxSizing: 'border-box',
            display: 'flex',
          }}
        >
          <span style={{ flex: 1, background: '#1E1A14', borderRadius: 1.5 }} />
        </span>
      </span>
    </div>
  );
}

export function MockHeader({ hdrChat, hdrBack, top = 47 }: { hdrChat: boolean; hdrBack: boolean; top?: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: 56,
        borderBottom: '1px solid #E8DFD0',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 16px 0 20px',
        boxSizing: 'border-box',
        zIndex: 5,
        background: '#FDF7EE',
      }}
    >
      {hdrBack && (
        <span style={{ display: 'flex', color: '#4A443A', marginRight: 8 }}>
          <Icon name="arrow_back" size={26} />
        </span>
      )}
      <span style={{ font: '800 25px/1 var(--font-montserrat)', letterSpacing: '-.01em', color: '#1E1A14' }}>
        On It<span style={{ color: '#B8960F' }}>.</span>
      </span>
      {hdrChat && (
        <div
          data-spot="hdrIcons"
          style={{ display: 'flex', gap: 8, marginLeft: 14, borderRadius: 14 }}
        >
          <span
            data-spot="newChat"
            style={{
              width: 42,
              height: 42,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 12,
              color: '#4A443A',
            }}
          >
            <Icon name="edit_square" size={27} />
          </span>
          <span
            data-spot="history"
            style={{
              width: 42,
              height: 42,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 12,
              color: '#4A443A',
            }}
          >
            <Icon name="history" size={27} />
          </span>
        </div>
      )}
      <span
        data-spot="howBtn"
        style={{
          marginLeft: 'auto',
          height: 40,
          padding: '0 17px',
          borderRadius: 20,
          background: '#D4AF37',
          display: 'flex',
          alignItems: 'center',
          font: '700 14.5px/1 var(--font-inter)',
          letterSpacing: '.03em',
          color: '#2A2410',
          whiteSpace: 'nowrap',
        }}
      >
        How On It works
      </span>
    </div>
  );
}

export function MockTabs({ tabNow }: { tabNow: TutorialTab }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 84,
        borderTop: '1px solid #E8DFD0',
        background: '#FDF7EE',
        display: 'grid',
        gridTemplateColumns: 'repeat(5,1fr)',
        paddingTop: 7,
        boxSizing: 'border-box',
        zIndex: 4,
      }}
    >
      {TABS.map(({ key, label, icon }) => {
        const on = key === tabNow;
        return (
          <div
            key={key}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
          >
            <span
              style={{
                width: 62,
                height: 34,
                borderRadius: 17,
                background: on ? '#D4AF37' : key === 'chat' ? '#F2E5BC' : 'transparent',
                display: 'grid',
                placeItems: 'center',
                color: '#1E1A14',
                transition: 'background .3s',
              }}
            >
              <Icon name={icon} size={26} filled={on} />
            </span>
            <span
              style={{
                font: `${on ? 700 : 400} 12.5px/1 var(--font-inter)`,
                color: on ? '#1E1A14' : '#4A443A',
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
      <span
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 7,
          width: 134,
          height: 5,
          marginLeft: -67,
          borderRadius: 3,
          background: '#1E1A14',
        }}
      />
    </div>
  );
}

export function MockChrome({
  hdrChat,
  hdrBack,
  tabNow,
  children,
  laptop,
}: {
  hdrChat: boolean;
  hdrBack: boolean;
  tabNow: TutorialTab;
  children: ReactNode;
  /** Dormant laptop stage: no 9:41 bar and no phone tab bar, and the header moves
   *  up to the frame's top edge. Undefined on every phone/iPad render. */
  laptop?: boolean;
}) {
  return (
    <>
      {!laptop && <StatusBar />}
      <MockHeader hdrChat={hdrChat} hdrBack={hdrBack} top={laptop ? 0 : 47} />
      {children}
      {!laptop && <MockTabs tabNow={tabNow} />}
    </>
  );
}

/** Dormant laptop stage (design tutorial frame): 288 sidebar + 1152 content with
 *  the 72px page header. Only rendered when the tour is opened with ?laptop=1;
 *  the phone frame above is what every visitor still gets. */
export function LaptopShell({ tab, children }: { tab: TutorialTab; children: ReactNode }) {
  const label = TABS.find((t) => t.key === tab)?.label ?? '';
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', background: '#FDF7EE' }}>
      <aside
        style={{
          width: 288,
          flex: 'none',
          borderRight: '1px solid #EFE4D2',
          padding: '24px 16px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 4px 18px',
            font: '800 26px/1 var(--font-montserrat)',
            letterSpacing: '-.01em',
            color: '#1E1A14',
          }}
        >
          On It<span style={{ color: '#B8960F' }}>.</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 40,
            padding: '0 14px',
            marginBottom: 14,
            borderRadius: 999,
            background: '#D4AF37',
            color: '#1E1A14',
            font: '700 14px/1 var(--font-inter)',
          }}
        >
          How it works
          <Icon name="expand_more" size={20} />
        </div>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <div
              key={t.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                height: 44,
                padding: '0 14px',
                borderRadius: 14,
                background: active ? '#D4AF37' : 'transparent',
                color: '#1E1A14',
                font: '600 17px/1 var(--font-inter)',
              }}
            >
              <Icon name={t.icon} size={22} />
              {t.label}
            </div>
          );
        })}
      </aside>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            height: 72,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 32px',
            borderBottom: '1px solid #EFE4D2',
            font: '700 24px/1 var(--font-montserrat)',
            color: '#1E1A14',
          }}
        >
          {label}
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
      </div>
    </div>
  );
}
