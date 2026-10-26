import type { SceneState } from '../player-state';
import ChatMock from './ChatMock';
import InvoicesMock from './InvoicesMock';

export function MockScreen({ state, chatMax }: { state: SceneState; chatMax: number }) {
  if (state.screen === 'chat') return <ChatMock state={state} chatMax={chatMax} />;
  if (state.tabNow === 'invoices') return <InvoicesMock state={state} />;
  return null;
}
