// /settings/help/feedback — "Tell us about On It" (FEEDBACK-SPEC.md §1).
// Also the landing for the Chat prompt: /settings/help/feedback?src=chat_prompt&from=/chat
import FeedbackScreen from './FeedbackScreen';

export const dynamic = 'force-dynamic';

export default function FeedbackPage() {
  return <FeedbackScreen />;
}
