# On It: Who Builds What

Two agents, two jobs. This file is binding for both. It exists so Freebuff's cheap
credits do the plumbing and Claude Code's credits are spent only on what the user sees.

## The split

**Freebuff builds everything the user does NOT see.**
- Routes, API handlers, webhooks
- Database, migrations (written, never applied without the founder's yes, see CLAUDE.md)
- Events, background logic, parsing, validation, security
- Pure functions in `src/lib/**` and their unit tests
- Hooks, data fetching, state, wiring
- Components with **no styling**: data in, callbacks out (see "Headless components")

**Claude Code builds everything the user sees.**
- Layout, spacing, colors, typography, radii, shadows
- Visible copy and wording
- Animation, motion, transitions, haptic-style feedback
- Icons, states on screen (loading, error, empty, pending)
- The responsive behavior (390px phone, laptop >= 1280)

**Claude Code builds UI ONLY from what Claude Design made.** The HTML in `design/` is
the source of truth. If there is no design for a screen or state, Claude Code stops and
asks the founder. The exception is when the founder says "skip design for this" in the
task, in plain words, for that task only.

## Rules

1. **Freebuff does not touch UI.** No edits to className, markup structure, styles,
   `globals.css`, `design/tokens.css`, tailwind config, fonts, icon sets, or any
   user-visible wording.
2. **Allowed in UI files:** wiring only. Adding a prop, a callback, a hook call, or a
   data field, as long as the rendered markup, classes and copy do not change.
3. **Freebuff never guesses at UI.** When the feature needs something visible that has no
   design, Freebuff **stops** and writes a Handoff Note (format below). It does not
   improvise a "temporary" look.
4. **Claude Code does not build features.** No routes, migrations, event writers or
   business logic. If the UI needs data that does not exist, Claude Code stops and
   writes a Back-Note to Freebuff (what field or callback is missing).
5. **Claude Code matches the HTML exactly.** Exact values from the HTML source (sizes,
   radii, padding, hex, timings, easings) and exact copy strings. No Tailwind
   approximations. Every UI task ends with a fidelity report: MATCH / DIFF / UNVERIFIED
   per element. Never claim a match that was not checked.
6. **Scope per UI task is one design section.** "Match section 03 of
   `design/<feature>/<file>.html`", never "build the feature". This is what keeps
   Claude Code's credit use small.
7. **Everything else in CLAUDE.md still applies** (audit first, one commit per item,
   tests, preview-only testing, migration safety, no `quote` copy).

## Headless components

When Freebuff needs a component to exist so the logic can be wired and tested:
- Put it in the right place in `src/components/**`.
- Props are data in and callbacks out. Typed.
- No `className`, no inline `style`, no copy except neutral placeholders.
- First line of the file: `// UI-PENDING: headless. Claude Code styles this from <design file + section>.`
- List it in the Handoff Note.

Claude Code removes the `UI-PENDING` marker when the component matches the design.

## The flow

1. Freebuff builds the plumbing. It reaches a visible part and **stops**.
2. Freebuff prints a **Handoff Note** (format below).
3. The founder pastes the note into Claude chat.
4. Claude writes the **Claude Design prompt** and lists which screenshots to attach.
5. The founder runs Claude Design. The resulting HTML is saved under
   `design/<feature>/` (Claude puts it there itself).
6. Claude Code builds the UI from that HTML, one section per task, ends with the
   fidelity report, and removes the `UI-PENDING` markers.
7. Freebuff resumes the rest of the feature.

## Handoff Note format (Freebuff to Claude)

Freebuff fills in every heading. Write "none" instead of skipping one.

```
HANDOFF NOTE: UI NEEDED
Feature:            <name>
Branch / last commit: <branch> @ <sha>
Why this is needed: <one or two sentences, in the founder's terms>

1. WHERE IT LIVES
   - Screen / route: <e.g. Chat thread, /invoices/[id]>
   - Component file(s): <existing file to change, or new headless file created>
   - Triggered by: <user tap, an event arriving, a route load, a timer>

2. WHAT THE USER IS TRYING TO DO
   <plain words, one short paragraph>

3. DATA IN  (props or hook result)
   <field: type: example value, one line each>
   Source: <table / route / event kind>

4. ACTIONS OUT  (every tap or gesture)
   <callback name: what the user did: what it calls (route/RPC): what it returns>

5. STATES THE DESIGN MUST COVER
   - Idle:
   - Pending (after a tap, visible within ~100ms):
   - Success:
   - Error: <list the REAL causes: signed out, offline, server error, locked, etc.>
   - Empty / zero:
   - Repeat-tap (what a second tap does):
   - Offline / slow network:
   - Signed-out:

6. EDGE CASES
   - Long text (names, descriptions):
   - Large numbers / many items:
   - 1 item vs 100 items:
   - Narrow phone (390px) and laptop (>= 1280):

7. WORDING THE LOGIC PRODUCES
   <every user-visible string the logic can emit, with the key/helper it comes from.
    Claude Code owns the final wording.>

8. MOTION / FEEDBACK WANTED
   <what should animate and why, or "none">

9. REUSE
   - Existing components to reuse:
   - Tokens / patterns it should look like: <e.g. same card anatomy as the event cards>
   - Must NOT change: <header, tab bar, anything frozen>

10. REFERENCES FOR CLAUDE DESIGN
   - Screenshots to attach: <which live screens, which existing design HTML>
   - Closest existing design section: <file + section id>

11. DONE WHEN
   <checklist the founder can tap through on the preview>

12. OPEN QUESTIONS FOR THE FOUNDER
   <multiple-choice style, simple terms>
```

## Back-Note format (Claude Code to Freebuff)

```
BACK-NOTE: DATA/LOGIC NEEDED
Design file + section:
What the UI needs that does not exist: <field / callback / state>
Where it should come from:
Blocking: <yes/no>
```

## Quick reference

| Need | Owner |
|---|---|
| Route, RPC, migration, event, test, pure logic | Freebuff |
| Props, hooks, wiring | Freebuff |
| Anything visible: look, copy, motion | Claude Code, from the Claude Design HTML |
| No design exists for it | Stop. Handoff Note. |
| Founder says "skip design for this" | Claude Code may build it, for that task only |
