// Does this Chat message sound like the user wants to give feedback about On It
// itself? (FEEDBACK-SPEC.md, "Chat offers the feedback button".) Deterministic
// on purpose: free, instant, testable, and it never sends the message to the AI
// or burns a free-tier use. Conservative: a false positive would hijack a real
// invoice message, so it only fires on phrases clearly aimed at the app, never
// on generic words like "add" or "change" that invoice edits use all the time.
//
// Widen the phrase list from real messages later; each addition needs a test
// for both directions (a feedback line that matches, a job line that doesn't).

const MAX_CHARS = 240; // a feedback ask is short; a long message is almost surely a job

// Strong, app-directed phrases. Case-insensitive; apostrophes normalised first.
const PATTERNS: RegExp[] = [
  // "I have feedback", "give/leave/send/share/submit feedback", "some feedback", "my feedback"
  /\b(give|leave|send|share|submit|have|got|some|my|any|want to (?:give|leave|share))\s+(?:you\s+|us\s+|the\s+\w+\s+)?(?:some\s+|a\s+bit\s+of\s+)?feedback\b/,
  /\bfeedback\s+(?:for|about|on)\s+(?:you|on it|the app|this app|the developer|the founder)\b/,
  /^\s*feedback[.!?]?\s*$/,
  /\b(feature request|request a feature|request (?:a |the )?new feature|suggest (?:a |an )?(?:feature|idea|improvement))\b/,
  /\bi (?:have|got|had) (?:a |an )?(?:suggestion|idea|request|complaint)\b/,
  /\b(?:report|found|there'?s|got) (?:a |an )?(?:bug|glitch)\b/,
  /\breport (?:a |an )?(?:problem|issue)\b/,
  // wishes aimed at the app
  /\bi wish (?:on it|you|this app|the app|it) (?:could|would|had|did|can|let|allowed)\b/,
  /\b(?:it|this|that|you) would be (?:nice|great|cool|awesome|helpful) if (?:on it|you|it|the app|this app)\b/,
  /\b(?:you|on it) should (?:really )?(?:add|have|support|let me)\b/,
  /\bwhy (?:can'?t|doesn'?t|won'?t) (?:you|on it|the app|this app)\b/,
  // complaints / praise aimed at the app
  /\b(?:this|the) app (?:is|keeps|doesn'?t|isn'?t|won'?t|crashes|sucks|needs)\b/,
  /\bon it (?:keeps|doesn'?t|isn'?t|won'?t|crashes|is (?:broken|buggy|confusing|slow|annoying|great|awesome|amazing))\b/,
  /\bi (?:love|like|hate|really like|really love) (?:this app|on it|using on it)\b/,
  // wants a human
  /\b(?:tell|talk to|message|contact|reach|email|speak to) (?:the |a |your )?(?:developer|dev|founder|owner|creator|team|human|person|support)\b/,
  /\b(?:leave|write|give) (?:a |an )?(?:review|comment|complaint)\b/,
  /\b(?:complain|complaint)\b/,
];

export function isFeedbackIntent(raw: string): boolean {
  if (!raw) return false;
  const t = raw.replace(/[’‘]/g, "'").trim().toLowerCase();
  if (t.length < 8 && t !== 'feedback') return false;
  if (t.length > MAX_CHARS) return false;
  // Money or numbers beside a document word means a job, not feedback.
  if (/\$/.test(t)) return false;
  if (/\b(quote|invoice|bill|estimate)\b/.test(t) && /\d/.test(t)) return false;
  // A message that opens with a document verb is a job: "invoice him, he has feedback".
  if (/^(invoice|quote|bill|estimate|send|make|create|add)\b/.test(t)) return false;
  return PATTERNS.some((re) => re.test(t));
}

/** What Chat answers with, above the button. */
export const FEEDBACK_REPLY =
  "I'd love to hear it. Tap below and tell us. We read every one and reply by email if there's something to say.";
