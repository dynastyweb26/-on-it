# Tool evals

Each file in `evals/` is a list of graded chat cases. A case names the request,
a fixture database, and what must be true afterwards: the tools called (and any
arguments that matter), the template id, and that the turn writes nothing. The
runner never grades wording.

```bash
ANTHROPIC_API_KEY=… node --import ./scripts/test-register.mjs scripts/evals/run.ts --file evals/read-tools.json
```

The gate is a 90% pass rate plus zero failures on cases tagged `money` or
`send`.

## Known failures

A case documenting a bug that is still open carries:

```json
{
  "id": "record-payment-amount-in-words",
  "expectedFail": true,
  "reason": "The old /api/parse flow still composes the amount as words.",
  "request": "…",
  "expect": { "writes": 0 }
}
```

- `expectedFail` inverts the gate **for that case only**: while it fails, the
  gate passes; the day it passes, the gate fails with "remove the marker", so
  the marker cannot outlive the bug.
- `reason` is required (the loader refuses a case without one) and names the
  flow that still owns the behaviour.
- Remove `expectedFail` and `reason` together when the bug is fixed.
