// Layer 6 of the security stack: input sanitization against prompt injection.
// User text goes to Claude wrapped in <user_input> tags; nothing inside may be
// able to close or open a tag.
//
// Stripping "tag-like sequences" with a regex is a losing game: a space after
// the slash, an unclosed tag, an invisible character before the name, or a
// look-alike bracket (fullwidth ＜＞, small-form ﹤﹥) each slipped past one
// version or another. So instead of recognising tags, no angle bracket
// survives at all:
//   1. NFKC — folds the look-alike brackets (and other compatibility forms)
//      into plain < and >, so step 3 catches them.
//   2. Drop invisible format characters (zero-width space/joiners, BOM, bidi
//      controls) that could split a tag name or hide text.
//   3. Replace every < and > with the single angle quotes ‹ › — still
//      readable to the model ("under ‹$500"), never markup.
//   4. Collapse control characters, cap the length.

const MAX_MESSAGE_LEN = 2000;

export function sanitizeForAI(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
    .slice(0, MAX_MESSAGE_LEN)
    .trim();
}

export function sanitizeField(raw: unknown, maxLen = 300): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[<>]/g, '').slice(0, maxLen).trim();
}
