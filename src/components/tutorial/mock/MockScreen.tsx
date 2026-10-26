import type { SceneState } from '../player-state';
import ChatMock from './ChatMock';

export function MockScreen({ state, chatMax }: { state: SceneState; chatMax: number }) {
  if (state.screen === 'chat') return <ChatMock state={state} chatMax={chatMax} />;
  return null;
}
