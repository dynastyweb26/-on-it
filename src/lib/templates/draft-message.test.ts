import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTemplateProps,
  resolveDraftMessageState,
  TEMPLATE_STATES,
  type DraftMessageDevice,
  type DraftMessageState,
} from './props';
import { DRAFT_MESSAGE_STATE_FIXTURES } from './fixtures';

// Every state on both channels. The design's script maps Email-only states
// arriving with Text to their Text equivalent (and the reverse); Text on a
// laptop turns sent into copied, on a phone into opened.
const EXPECTED: Record<
  DraftMessageState,
  { textPhone: DraftMessageState; textLaptop: DraftMessageState; email: DraftMessageState }
> = {
  draft: { textPhone: 'draft', textLaptop: 'draft', email: 'draft' },
  editing: { textPhone: 'editing', textLaptop: 'editing', email: 'editing' },
  opened: { textPhone: 'opened', textLaptop: 'opened', email: 'sent' },
  copied: { textPhone: 'copied', textLaptop: 'copied', email: 'sent' },
  done: { textPhone: 'done', textLaptop: 'done', email: 'sent' },
  openError: { textPhone: 'openError', textLaptop: 'openError', email: 'error' },
  sent: { textPhone: 'opened', textLaptop: 'copied', email: 'sent' },
  error: { textPhone: 'openError', textLaptop: 'openError', email: 'error' },
  nocontact: { textPhone: 'nocontact', textLaptop: 'nocontact', email: 'nocontact' },
  loading: { textPhone: 'loading', textLaptop: 'loading', email: 'loading' },
  cancelled: { textPhone: 'cancelled', textLaptop: 'cancelled', email: 'cancelled' },
};

test('every state and channel pair maps exactly as the design script does', () => {
  for (const state of Object.keys(EXPECTED) as DraftMessageState[]) {
    for (const device of ['phone', 'laptop'] as DraftMessageDevice[]) {
      const expected = device === 'phone' ? EXPECTED[state].textPhone : EXPECTED[state].textLaptop;
      assert.equal(
        resolveDraftMessageState(state, 'Text', device),
        expected,
        `Text on ${device}: ${state}`,
      );
      assert.equal(
        resolveDraftMessageState(state, 'Email', device),
        EXPECTED[state].email,
        `Email on ${device}: ${state}`,
      );
    }
  }
});

test('every draft.message state has a fixture in the channel and device it needs', () => {
  assert.deepEqual(Object.keys(DRAFT_MESSAGE_STATE_FIXTURES), [...TEMPLATE_STATES['draft.message']]);

  for (const state of Object.keys(DRAFT_MESSAGE_STATE_FIXTURES) as DraftMessageState[]) {
    const fixture = DRAFT_MESSAGE_STATE_FIXTURES[state];
    assert.equal(fixture.state, state);
    const parsed = parseTemplateProps('draft.message', fixture);
    assert.equal(parsed.success, true, `${state}: ${parsed.success ? '' : parsed.error.message}`);
  }

  assert.equal(DRAFT_MESSAGE_STATE_FIXTURES.opened.device, 'phone');
  assert.equal(DRAFT_MESSAGE_STATE_FIXTURES.done.device, 'phone');
  assert.equal(DRAFT_MESSAGE_STATE_FIXTURES.copied.device, 'laptop');
  assert.equal(DRAFT_MESSAGE_STATE_FIXTURES.openError.channel, 'Text');
  assert.equal(DRAFT_MESSAGE_STATE_FIXTURES.sent.channel, 'Email');
  assert.equal(DRAFT_MESSAGE_STATE_FIXTURES.error.channel, 'Email');
});
