import type { SceneState } from '../player-state';
import BooksMock from './BooksMock';
import ChatMock from './ChatMock';
import ClientsMock from './ClientsMock';
import InvoicesMock from './InvoicesMock';
import SettingsMock from './SettingsMock';

export function MockScreen({ state, chatMax }: { state: SceneState; chatMax: number }) {
  if (state.screen === 'chat') return <ChatMock state={state} chatMax={chatMax} />;
  if (state.tabNow === 'invoices') return <InvoicesMock state={state} />;
  if (state.tabNow === 'clients') return <ClientsMock state={state} />;
  if (state.tabNow === 'books') return <BooksMock state={state} />;
  if (state.tabNow === 'settings') return <SettingsMock state={state} />;
  return null;
}
