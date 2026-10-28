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
      {/* Laptop: the shell's 72px page header is the only header (the design's
          chat screen has the title and the icon pair inside its 720 column). */}
      {!laptop && <MockHeader hdrChat={hdrChat} hdrBack={hdrBack} />}
      {children}
      {!laptop && <MockTabs tabNow={tabNow} />}
    </>
  );
}

/** Laptop stage (design tutorial frame): 288 sidebar + 1152 content with the 72px
 *  page header. Rendered at >= 1280; below that the phone frame above is used. */
export function LaptopShell({ tab, children }: { tab: TutorialTab; children: ReactNode }) {
  const label = TABS.find((t) => t.key === tab)?.label ?? '';
  // The design puts a 72px page bar (title + the new-chat / history pair) on the
  // Chat screen only; every other screen draws its own title inside the content.
  const header = tab === 'chat';
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', background: '#FDF7EE' }}>
      {/* The sidebar is the REAL one's chrome, measured off the app at 1440
          (AppShell's aside + InstallBanner's sidebar card): 288 wide, 28/20/20
          padding, a 36-high gold "How it works" pill beside the wordmark,
          48-high nav items with 4 between them, and the compact install card
          pinned to the bottom. Decoration only — the whole shell is aria-hidden
          and nothing in it is interactive. */}
      <aside
        style={{
          width: 288,
          flex: 'none',
          borderRight: '1px solid rgba(208,197,175,.35)',
          background: '#FBF3E5',
          padding: '28px 20px 20px',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 4px 28px',
            font: '800 26px/1 var(--font-montserrat)',
            letterSpacing: '-.01em',
            color: '#1F1B13',
          }}
        >
          <span>On It<span style={{ color: '#735C00' }}>.</span></span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 36,
              padding: '0 14px',
              borderRadius: 9999,
              background: '#D4AF37',
              color: '#1F1B13',
              font: '600 13.5px/1 var(--font-inter)',
              whiteSpace: 'nowrap',
            }}
          >
            How it works
            <Icon name="expand_more" size={18} />
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <div
                key={t.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  height: 48,
                  padding: '0 16px',
                  borderRadius: 16,
                  background: active ? '#D4AF37' : 'transparent',
                  color: active ? '#1F1B13' : '#4D4635',
                  font: `${active ? 700 : 600} 16px/1 var(--font-inter)`,
                }}
              >
                <Icon name={t.icon} size={24} filled={active} />
                {t.label}
              </div>
            );
          })}
        </div>
        {/* Pinned to the bottom, like the app's mt-auto wrapper. */}
        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          <div
            style={{
              borderRadius: 20,
              border: '1px solid rgba(208,197,175,.35)',
              background: '#FFFFFF',
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ marginTop: 2, flex: 'none', color: '#735C00', display: 'flex' }}>
                <Icon name="install_mobile" size={24} />
              </span>
              <p
                style={{
                  margin: 0,
                  minWidth: 0,
                  flex: 1,
                  font: '400 13px/1.35 var(--font-inter)',
                  color: '#1F1B13',
                }}
              >
                Install On It for faster access.
              </p>
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 9999,
                  background: '#D4AF37',
                  color: '#1F1B13',
                  font: '600 13px/1 var(--font-inter)',
                }}
              >
                Install
              </span>
            </div>
          </div>
        </div>
      </aside>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Chat's header is the design's: a 720 row inside the content area, title
            left, the new-chat / previous-chats pair right. */}
        {header ? (
          <div style={{ height: 72, flex: 'none', display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: 720,
                flex: 'none',
                height: 72,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #F0E7D8',
                font: '700 24px/1 var(--font-montserrat)',
                color: '#1E1A14',
              }}
            >
              <span>{label}</span>
              <div data-spot="hdrIcons" style={{ display: 'flex', gap: 4, borderRadius: 14 }}>
                <span
                  data-spot="newChat"
                  title="New chat"
                  style={{
                    width: 40,
                    height: 40,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 12,
                    color: '#4D4635',
                  }}
                >
                  <Icon name="edit_square" size={24} />
                </span>
                <span
                  data-spot="history"
                  title="Previous chats"
                  style={{
                    width: 40,
                    height: 40,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 12,
                    color: '#4D4635',
                  }}
                >
                  <Icon name="history" size={24} />
                </span>
              </div>
            </div>
          </div>
        ) : null}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
      </div>
    </div>
  );
}
