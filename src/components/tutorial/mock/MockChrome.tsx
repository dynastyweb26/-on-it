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

export function MockHeader({ hdrChat, hdrBack }: { hdrChat: boolean; hdrBack: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 47,
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
}: {
  hdrChat: boolean;
  hdrBack: boolean;
  tabNow: TutorialTab;
  children: ReactNode;
}) {
  return (
    <>
      <StatusBar />
      <MockHeader hdrChat={hdrChat} hdrBack={hdrBack} />
      {children}
      <MockTabs tabNow={tabNow} />
    </>
  );
}
