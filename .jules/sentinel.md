## 2026-09-19 - Client-Supplied Conversation History In LLM APIs
**Vulnerability:** Untrusted client payloads sent to `/api/parse` could contain `assistant` role messages in `history` that bypassed `sanitizeForAI()`.
**Learning:** Developers often assume only `user` messages contain untrusted input because `assistant` messages originate from the model in normal UI flows. However, when the client transmits the entire conversation history in an API request, all message roles in the payload are client-controlled and untrusted.
**Prevention:** Sanitize every message in a client-supplied conversation history regardless of its `role` before constructing prompt messages for LLMs.

## 2026-10-20 - Unicode NFKC Bypass in Character-Filtering Sanitizers
**Vulnerability:** Sanitizing field inputs with regex replacements like `replace(/[<>]/g, '')` before applying NFKC Unicode normalization allows fullwidth/compatibility look-alikes (`＜`, `＞`) to bypass filters, which can later be normalized downstream into active markup.
**Learning:** Character-stripping functions must always run Unicode NFKC normalization (`normalize('NFKC')`), strip format control characters (`\p{Cf}`), and replace control characters prior to regex stripping.
**Prevention:** Always normalize Unicode compatibility forms via NFKC and strip format control characters at the top of field sanitizers before filtering targeted characters or length-truncating.

## 2026-10-29 - Weekly Security Scan (No New Findings)
Checked all 42 API routes, Supabase RLS policies, RPC security, webhook signature validations, rate limiting, and public token endpoints. No new unhandled gaps or security vulnerabilities were identified.

## 2026-07-06 - Input Validation on Empty-Body Routes
**Vulnerability:** Adding schema validation to endpoints with empty request bodies without real constraints can create superficial "security theater".
**Learning:** Checking Zod `z.object({}).nullish()` with `.catch(() => ({}))` permits any payload (including invalid JSON or arbitrary objects) and does not increase security.
**Prevention:** Avoid adding placeholder validation schemas to routes that accept no body; instead, focus validation efforts on endpoints that receive user input or state-changing parameters.
