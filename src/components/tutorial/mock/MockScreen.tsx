import type { SceneState } from '../player-state';
import BooksMock from './BooksMock';
import ChatMock from './ChatMock';
import ClientsMock from './ClientsMock';
import InvoicesMock from './InvoicesMock';
import SettingsMock from './SettingsMock';

// `nudge` is the overlay's auto-scroll: px added to the scrolling area's translateY
// so the spotlight target stays inside the visible content area.
export function MockScreen({
  state,
  chatMax,
  nudge,
  laptop,
}: {
  state: SceneState;
  chatMax: number;
  nudge: number;
  /** Laptop stage (>= 1280); the chat, clients and invoices mocks read it so far. */
  laptop?: boolean;
}) {
  if (state.screen === 'chat') return <ChatMock state={state} chatMax={chatMax} nudge={nudge} laptop={laptop} />;
  if (state.tabNow === 'invoices') return <InvoicesMock state={state} laptop={laptop} />;
  if (state.tabNow === 'clients') return <ClientsMock state={state} laptop={laptop} />;
  if (state.tabNow === 'books') return <BooksMock state={state} nudge={nudge} laptop={laptop} />;
  if (state.tabNow === 'settings') return <SettingsMock state={state} laptop={laptop} />;
  return null;
}
