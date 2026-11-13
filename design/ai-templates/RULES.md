# AI chat templates: standing rules

Binding for every phase that builds or wires these templates. Re-read at the start of each
session. Do not paraphrase away.

Source of truth: the Claude Design export in this folder (Board 9, exported Nov 11 2026;
`DraftMessage` and the board revised Nov 12 for the Text channel).
`Chat_Templates_Board.dc.html` is the board; each template is its own `.dc.html` file.
`support.js` is the design runtime the files need to open in a browser. It is not app code.

## 1. Who builds what

- Claude Code builds the visible components, from these files only.
- Freebuff builds the registry, tool handlers, data and wiring. Freebuff never renders a
  stand-in for a template. If a template component does not exist yet, the tool returns its
  data and the reply falls back to plain text. No makeshift card, ever.
- If something visible is needed that is not in this folder, stop and write a handoff note.

## 2. Template ids

The registry's `defaultTemplate` values, the design file and the React component share one
name. Do not invent other ids.

| id | design file | notes |
|---|---|---|
| `list.ranked` | `RankedList.dc.html` | generalizes the Unpaid Invoices card |
| `stat.tiles` | `StatTiles.dc.html` | 1 to 3 tiles |
| `chart.trend` | `TrendChart.dc.html` | falls back to `stat.tiles` at 1 point |
| `chart.breakdown` | `Breakdown.dc.html` | horizontal bars, never a pie |
| `draft.message` | `DraftMessage.dc.html` | revised Nov 12; see section 6, item 8 |
| `confirm.batch` | `BatchConfirm.dc.html` | 2 to 4 actions |
| `cant.do` | `CantDo.dc.html` | extends P-73 on Board 8 |
| `nav.link` | `NavLink.dc.html` | 1 to 3 items |
| `feedback.thumbs` | `Feedback.dc.html` | thumbs plus the thumbs-down follow-up |
| `feedback.checkin` | `CheckIn.dc.html` | occasional check-in card |

## 3. Fidelity

- Copy every value from the design file as written: colors, radii, borders, padding, gaps,
  min-heights, font family, size, weight, line-height, letter-spacing, icon names and sizes.
- If a hex value has no token in `design/tokens.css`, add a token with that exact value.
  Never substitute the nearest existing token. List every token you add in your report.
- Every state in the file's `state` enum gets built. No state is added and none is dropped.
  One owner-approved exception: `copyError` on `draft.message` (section 6, item 8).
- Text in the design is the copy. Do not reword it. Wording that depends on data follows the
  pattern in the file's script (for example "Confirm 3 changes?", "2 saved, 1 didn't.").
- Truncation rules are part of the design: names and secondary lines truncate to one line;
  amounts, shares and chips never truncate or wrap.
- Motion exists only where the file has it: the `onitPop` check on Sent, All saved and
  Requested, the `onitSpin` spinner while saving or sending, and the 150ms opacity fade-in
  of the thumbs. Respect reduced motion exactly as the files do.
- Material Symbols Outlined only, through the app's subset font. Add any missing glyph to
  the subset; do not swap icons. No emojis. No dark mode.
- Never edit the chat header, composer or tab bar for this work.
- Report BUILT / NOT BUILT / ADDED BEYOND THIS PROMPT every phase. The last must be empty.

## 4. Thread spacing (from the board's Thread section)

| | px |
|---|---|
| side padding | 16 |
| avatar 28 + gutter | 8 |
| date label to turn | 20 |
| between turns | 24 |
| user message to reply | 16 |
| bubble to template | 8 |
| template to thumbs | 4 |
| thumbs left offset | -10 (optical) |

- A reply with a template has one avatar, at the top of the reply.
- Phone: designed at 390, template column 322 beside the avatar.
- Laptop (1280 and up): chat column 720. The thumbs-down follow-up and the check-in card
  stop at 420 wide. Other templates fill the column.

## 5. Money

- The assistant's text bubble never shows a dollar amount. Templates do.
- Every amount shown in a template is composed by the server and passed in as a finished
  string. Components do not format, add, or compute money, with one exception: the trend
  chart's readout formats the In, Out and Kept of the selected point from server numbers,
  using the same rule as the file's `fmt`.
- Signs are part of the string: `+` for money in, the minus sign U+2212 for money out. Use
  the same glyph the design uses.
- Money in is green, money out is red, and color never carries the meaning alone.

## 6. Logic decisions (owner approved unless marked OPEN)

1. Thumbs show under the latest assistant reply only, after its text has finished appearing,
   one set per reply even when it includes a card. A new reply removes them from the
   previous one. No space is reserved while text is streaming.
2. Thumbs never show on: a confirm card waiting for an answer, event cards and recap cards
   the app posts on its own, the signed-out reply, error replies, `cant.do` replies, or the
   last message of a reopened past chat.
3. Thumbs up fills the icon and does nothing else. Thumbs down fills the icon and opens the
   follow-up. Close, Skip and Send all keep the thumbs-down. The user can change the vote
   while the reply is still the latest; the log keeps the final vote.
4. Check-in card: at most once every 30 days, never in the middle of a task.
5. `list.ranked` shows at most 5 rows. "Show all N" opens the matching app screen; each tool
   that uses the template declares that destination.
6. `confirm.batch` holds records only (payments, expenses, edits). A reminder inside a
   multi-step request appears as a row that drafts the message; after Confirm, the
   `draft.message` card follows for the user to send. "Undo all" reverses the saved records
   and discards an unsent draft. It never claims to unsend a message.
7. `draft.message` body: any dollar amount inside the body is filled in by the server, not
   written by the model. The money guard applies to draft bodies too.
8. `draft.message` on the Text channel (settled Nov 12, design revised). On It hands a text
   off to the user's own Messages app and cannot know whether it was sent.
   - States: `draft`, `editing`, `nocontact`, `loading`, `cancelled` apply to both channels.
     `opened`, `copied`, `done`, `openError` are Text only. `sent` and `error` are Email only.
     If an Email-only state arrives with Text (or the reverse), map it exactly as the design
     file's script does.
   - Text on phone: primary is "Open in Messages" on its own full-width row above Cancel and
     Edit. After the tap the card shows "Opened in Messages" with Reopen and Mark done.
   - Text on laptop: primary is "Copy text". After copying the card shows "Text copied" with
     Copy again and Mark done.
   - The only Text error is that Messages could not be opened, with Copy text as the action.
   - Exception, owner approved Nov 12 2026, not in the design file: `copyError`. Text on
     laptop only, when Copy text fails. The card shows the existing error strip with
     "Couldn't copy. Select the text and copy it." and the body stays selectable. On a
     phone it maps to `openError`; on Email it maps to `error`. No other state may be
     added this way.
   - The check animation plays only on Email Sent and on Text Mark done.
   - `device` is `laptop` at viewport 1280 and up, `phone` below, the same breakpoint the
     rest of the app uses for laptop.
   - "Mark done" records that the user says they sent it. Nothing may describe a text as
     sent by On It.
9. OPEN: the trend chart readout says "Kept" and the stat tiles say "Net". Build as designed
   unless the owner picks one word.

## 7. Verification

- Add a fixtures page that renders every template in every state with the board's sample
  data, at a route that does not exist in production. Use it for the checks below.
- Add `design/ai-templates/diff.config.json` and run `scripts/design-diff.mjs` against the
  Vercel preview for each template state at 390 and at 1280. A FAIL blocks the commit.
- No localhost. Vercel preview only, on the test database.
