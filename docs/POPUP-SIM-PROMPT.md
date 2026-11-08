# Prompt for a cheaper agent: extend popup sim tests

Read CLAUDE.md, then `src/components/popups/sim/dom.ts`, `popsheet.test.ts`, `wiring.test.ts`.
Branch off `feat/popups-sim-tests`. Do not touch .github/workflows, scripts/ci, src/lib/ci, playwright.config.ts.
Never delete, skip or loosen a test. No migrations, no vercel CLI, never merge.

Job: for each popup below, find where it is wired (grep its title text), then check 4 things
and add a test per finding, one commit per popup:
1. Pending: the confirm handler is awaited (not fire-and-forget) so the sheet shows its busy label.
2. Failure: the handler THROWS on error (never swallows, never closes first), so the sheet shows
   the real cause from src/lib/errors.ts and stays open.
3. Repeat-tap: a ref guard (not only state) stops a second run.
4. Exit: pending clears on success, error, cancel.
If a handler swallows errors or closes first, fix it (restore/await first, throw on failure)
and add a test that fails without the fix. Use the source-scan style in wiring.test.ts.
Popups to cover: close-template, discard-expense, change guard (P-01), client picker (P-02),
replace template (P-03), deposit card, sign sheet, template sheets, mic card, alerts card.

Before finishing: `npx tsc --noEmit` and `npm test` pass. Report counts, max 15 lines, and list
any handler whose intended behavior is a judgment call instead of changing it.
