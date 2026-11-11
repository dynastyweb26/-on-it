# TOOLS.md — adding a tool to AI Smart

Read `TOOL-AUDIT.md` for what exists and `WORK-SPLIT.md` for who builds what. The
registry is `src/lib/tools/registry.ts`; one tool is one file in
`src/lib/tools/definitions/`.

Before you start: a tool answers a question the app can already answer from data
the user owns. If the feature needs a new screen or new copy on screen, stop and
write a Handoff Note instead.

## Five steps

**1. Write the definition file**

`src/lib/tools/definitions/<name>.ts` — one file, one `defineTool` call:

```ts
export const myTool = defineTool({
  name: 'my_tool',                 // snake_case, unique
  description: '…',                // the model chooses by this; say read-only if it is
  input: MyInput,                  // Zod, .strict() so unknown keys are refused
  output: MyOutput,                // Zod, the only shape allowed out of the handler
  type: 'read',                    // read | write | send | nav | meta
  risk: 'low',                     // low | medium | high
  defaultTemplate: { id: 'my_card', props: MyCardProps },
  handler: async (ctx, args) => { /* ctx.db, ctx.userId only */ },
  fixture: { args: {}, result: {} }, // must satisfy the schemas, or the registry throws
});
```

**2. Keep the handler honest**

- Database access is `ctx.db.select(table, plan)` only. It runs under the caller's
  session, so RLS is the boundary; always scope by `ctx.userId` as well.
- Never import `adminClient` from `src/lib/supabase/admin`, and never import a
  helper that does. `scripts/ci/tool-imports.ts` fails CI if a tool can reach it.
- Money is never a raw number in output and never in the model's mouth: compose
  it with `moneyField()` from `src/lib/tools/money.ts`.
- A `write` or `send` tool does not write during a turn. It is proposed, gets a
  confirm token, and runs from `POST /api/ai/confirm`. The turn loop does that
  for you when `type` says write/send.

**3. Declare what the result renders into**

`defaultTemplate.id` names the chat card, `props` is the Zod schema of what that
card accepts, and the safety suite checks the schema against your own result. If
no card exists for the result, stop: that is a design gap (Handoff Note).

**4. Export it**

Add the tool to `src/lib/tools/definitions/index.ts`. That is the only registry
change. At import time `buildRegistry` refuses an incomplete definition, a
duplicate name, or a fixture that contradicts its own schemas.

**5. Prove it**

- `npm test` — the shared suite (`src/lib/tools/safety.test.ts`) loops over every
  registered tool automatically: fixture validity, template props, money guard,
  another user's rows never leak, empty database invents nothing, write tools need
  a token, replays write one row.
- Add the tool's table to `ROWS` in that suite if it reads a new table.
- Add eval cases to `evals/<feature>.json` (request, expected tools and args,
  expected template id, expected state). Grade behaviour, never wording.
- `node --import ./scripts/test-register.mjs scripts/ci/tool-imports.ts` must be
  clean, and `npx tsc --noEmit` must pass.

## Rules that are not negotiable

- User session + RLS only. No service role anywhere under `src/lib/tools`.
- A read tool never writes; a write tool never runs without a confirm token.
- Money is typed server-composed data, and model text may only repeat a figure
  that turn's tool results already contain.
- Tests run on fixtures or PGlite, never against production and never skipped.
