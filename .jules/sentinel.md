## 2026-07-06 - Input Validation on Empty-Body Routes
**Vulnerability:** Adding schema validation to endpoints with empty request bodies without real constraints can create superficial "security theater".
**Learning:** Checking Zod `z.object({}).nullish()` with `.catch(() => ({}))` permits any payload (including invalid JSON or arbitrary objects) and does not increase security.
**Prevention:** Avoid adding placeholder validation schemas to routes that accept no body; instead, focus validation efforts on endpoints that receive user input or state-changing parameters.
