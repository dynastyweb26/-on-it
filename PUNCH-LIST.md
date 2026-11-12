# On It — Punch List

_Reset 2026-11-10. The previous list was stale and is in git history
(`git log -- PUNCH-LIST.md`). Status is one of **Done**, **Partial**, **Open**,
**Unverified** (can't be determined from the repo alone, e.g. live DB/runtime
state), or **Not Reproducible**. Evidence is `file:line` or a commit hash.
Trust this over ONIT-SPEC.md where they disagree; the spec is stale._

## Open

| Item | Status | Evidence |
|---|---|---|

## Done

| Item | Status | Evidence |
|---|---|---|

## Chat record-payment (found Nov 11)

| Item | Status | Evidence |
|---|---|---|
| The "Did someone pay you?" bubble repeats after every assistant reply | **Open** | The line "Did someone pay you? Name the client and how much, and I'll set it up for you to confirm." is appended to every reply in the record-payment flow instead of being asked once. |
| The reply states the amount in words, with no dollar sign | **Open** | "Ruth paid you 25 for a car wash." — the figure came from the model, not a server-composed money string; the money guard does not cover this path (`src/app/api/parse/route.ts` early return, TOOL-AUDIT §F1). |
| The card opens with Client empty and Amount 0.00 | **Open** | After "Ruth $25 for carwash" then "Zelle", the record-payment card showed "Who paid you?" and 0.00: the parsed fields did not carry the earlier turn's client and amount into the proposal. |
