## 2026-09-19 - Client-Supplied Conversation History In LLM APIs
**Vulnerability:** Untrusted client payloads sent to `/api/parse` could contain `assistant` role messages in `history` that bypassed `sanitizeForAI()`.
**Learning:** Developers often assume only `user` messages contain untrusted input because `assistant` messages originate from the model in normal UI flows. However, when the client transmits the entire conversation history in an API request, all message roles in the payload are client-controlled and untrusted.
**Prevention:** Sanitize every message in a client-supplied conversation history regardless of its `role` before constructing prompt messages for LLMs.

## 2026-07-06 - Input Validation on Empty-Body Routes
**Vulnerability:** Adding schema validation to endpoints with empty request bodies without real constraints can create superficial "security theater".
**Learning:** Checking Zod `z.object({}).nullish()` with `.catch(() => ({}))` permits any payload (including invalid JSON or arbitrary objects) and does not increase security.
**Prevention:** Avoid adding placeholder validation schemas to routes that accept no body; instead, focus validation efforts on endpoints that receive user input or state-changing parameters.
