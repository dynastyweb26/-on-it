# NAV-SPEC — Invoices tab navigation (Phase 1) + Mark as signed (Phase 2)

Source: Claude Design "Invoices tab · navigation redesign" mockup, reviewed and trimmed Oct 22 2026.
Applies to any coding agent: read CLAUDE.md, SECURITY.md and PUNCH-LIST.md first. Audit before editing.
Branch Phase 1 as `feat/invoices-nav`, off main. If `feat/tab-deck` has not merged yet, expect conflicts in
InvoicesView.tsx and the tabs; the deck's `active` prop contract below must hold either way.

## Decisions (locked by Deffeu, Oct 22 2026)
1. NO signature capture of any kind: no drawn image, no typed name, no sign link, no public sign page.
   Signing is a manual "Mark as signed" action by the contractor, recorded as a date. (Phase 2.)
2. Palette: keep the original gold (#d4af37) and black (#1f1b13). Adopt the mockup's cream/white
   layering (white chips and tiles on cream, cream cards, soft-gold pills, gold thumb on a cream track).
3. Bottom nav visual design stays frozen (tab-deck work). Nothing in this spec touches it.

## Palette: use existing tokens, add no new hex values
The mockup's creams are within 1-11 RGB points of tailwind.config.ts. Map, do not copy hex:

| Mockup role | Mockup hex | Use token |
|---|---|---|
| Screen bg | #FDF7EE | `background` |
| Card | #FAF2E4 | `surface-container-low` |
| Segmented track | #F4EAD8 | `surface-container` (Clients tab already uses this) |
| White chips / tiles | #FFFFFF | `surface-container-lowest` |
| Month pill, icon discs | #F2E5BE | `primary-soft` (DateDivider already does this) |
| Active chip bg | #F6EBC9 | `sent-container`, replacing hardcoded `bg-[#f6ebc6]` in InvoicesView |
| Inactive chip border | #CFC5B2 | `outline-variant` |
| Card border / dividers | #EADFC9 / #E8DECB | `outline-variant` at /60 (as the cards do today) |
| Gold text | #6E5600 | `primary` (#735c00) |
| Secondary / meta text | #5E5747 / #6B6455 | `on-surface-variant`. Do NOT use the mockup's lighter greys (5.3:1 vs ~9:1) |

Rules still apply: gold #d4af37 is fill only, never text; never white on gold; status chips always icon + text.

## Phase 1: UI only, no DB, no migration. One commit per item, in this order

### 1. Extract the pill segmented control (no visual change)
ClientsView.tsx has an inline gold-thumb pill control (h-14, rounded-full, thumb slides by transform). Extract it to
a shared component (e.g. `PillTabs`) and make ClientsView use it. Keep MOTION-SPEC §13 behavior and Reduce Motion.
Do not confuse with `SegmentedControl.tsx` (the small h-9 control used in expenses/recurring).

### 2. Invoices tab: top segment + two filters per side
Replace the single All / Unpaid / Paid / Quotes row in `components/tabs/InvoicesView.tsx` with:
- Top pill control: **Invoices | Quotes**. (Label stays "Quotes" until the rename pass, see Parked. Do not ship
  "Estimates" next to Q-numbers and "Quote" PDFs.)
- Filters under it, each with a count chip:
  - Invoices side: **Open | Paid**
  - Quotes side: **Pending | Signed** (Signed holds converted quotes too; they keep the CONVERTED tag)
- Definitions:
  - Open = invoice with status draft, sent, or overdue. (Today drafts only appear under All; removing All needs
    them a home.)
  - Paid = invoice status paid.
  - Quotes Pending = quote not converted and not signed. Signed = signed or converted. Until Phase 2 ships
    there is no signed state: Signed contains converted quotes only.
- INVARIANT (see current comment in the file): the Open summary total must equal Books "Still owed". The summary line
  therefore reads `N open · $X owed`, where $X sums balance due over sent/overdue rows only. Drafts count toward N
  but never toward $X. Keep the part-paid treatment (balance due, "due of $total") as is. No new PARTIAL tag.
- URL back-compat (Books tile and coach marks deep-link here):
  `?filter=unpaid` -> Invoices / Open, `?filter=paid` -> Invoices / Paid, `?filter=quote` -> Quotes / Pending,
  `?filter=all` -> Invoices / Open. Replace, don't push, history (as today).
- Preserve every `data-coach` anchor (`invoices-filter`, `invoices-list`, `invoices-empty`). The tutorial walkthroughs
  depend on them. Re-point `invoices-filter` at the filter row; re-test the Invoices walkthrough.
- Counts come from the fetched rows (the query is capped at 200). State this in a code comment; do not add a count query.
- Honor the tab-deck contract: nothing fetches or reads the route unless `active`. Filter chips stay inside the
  tab panel; if horizontal swipe conflicts, use `data-no-tab-swipe` as ComposerMenu does.
- Keep the existing SortCaption (Newest / A-Z) and DateDivider month pills exactly as they are. They already match the mockup.
- Chip height must be at least 44px (mockup's are ~42px; the app standard is 56px for primary targets).

### 3. Cream layering pass on the list
Apply the token map above to the Invoices/Quotes list only: cards, chips, pills, borders. Replace the hardcoded
`bg-[#f6ebc6]`. No change to tailwind.config.ts, globals.css or other screens. If a role has no token, stop and ask.

### 4. Empty states
Replace the one-line paragraph in `data-coach="invoices-empty"` with icon + title + body + outlined pill CTA:
- First-run (account has zero documents of this kind): do NOT say "all caught up". Suggested: "No invoices yet",
  "Tell On It about a job in Chat and it shows up here."
- Filtered-empty (other filter has items): Open empty -> "Nothing open", "You're all caught up."; Paid empty -> "No paid invoices yet",
  "Invoices move here once you record a payment."; Quotes Pending empty -> "No pending quotes", "Send a quote and it waits here until your client signs."; Signed empty -> "No signed quotes yet",
  "Converted quotes land here."
- CTA: an outlined pill labelled "Open Chat" (icon `chat_bubble`) that navigates to Chat. It creates nothing, so it is
  never labelled "New invoice"/"New quote". First-run body: "Tell On It about a job in Chat and it shows up here."
  No FAB, no new create entry on populated lists. Leave the Clients empty state alone.
- Icons: Outlined only, from the `IconName` subset. Any new glyph needs `npm run icons:build`
  (icon-names.ts). Mockup uses Rounded; ignore that.

## Phase 2: Mark as signed (own branch `feat/quote-signed`, after Phase 1 merges)
Audit `app/(app)/invoices/[id]/page.tsx` first; it was not reviewed for this spec.
- Data: add nullable `approved_at timestamptz` to `invoices` (additive, so it may go from the feature branch under the
  CLAUDE.md migration flow: dry run, full SQL shown, explicit yes, `db push`, privilege check). Do NOT add a status
  value: the status CHECK constraint (created in 001_init.sql; confirm no later migration changed it) would have to
  change, which counts as destructive and is main-only.
  Add the column to the privilege check's list per CLAUDE.md.
- UI on a sent quote: outlined "Mark as signed" action; tapping it sets `approved_at = now()` with an undo toast
  (UndoToast exists). On a signed quote show a SIGNED tag (icon `verified`, paid-container / paid colors) with the date.
  No image, no name, no sign link, no audit-trail table.
- "Convert to Invoice": outlined secondary while sent, gold primary (floating bar as in the mockup) once signed.
  Converting an unsigned quote stays allowed (today's behavior).
- Lists: tagFor() in lib/doc-tags.ts gains SIGNED for quotes with `approved_at`; the Quotes Signed filter uses it.
- Locked sent/paid documents keep today's rules; signed quotes lock like sent ones (Revise creates a new draft).

## Parked (do not build in these branches; log in Notion)
1. Quote -> Estimate rename and E-#### numbering: 64 files / ~274 lines mention "quote". Number prefix is centralized in
   `lib/documents.ts` (`docPrefix`), but already-sent PDFs and links carry Q-numbers. Needs its own decision on
   display-only rename vs DB, PDFs, AI prompts, tutorial copy, Terms.
2. "Record expense" in the "+" menu: Chat already has a camera/gallery receipt path. Current menu stays Voice / Invoice / Quote.
3. Any e-signature capture (dropped Oct 22).
4. Chat header at 390px: the mockup's header wraps; check the live Chat header at 360-390px and fix only if it reproduces.
5. Open the guided template from the Invoices tab: ChatView's `startNewTemplate` / `pickFromPlus` are local, so an
   Invoices CTA cannot open the "+" menu's invoice/quote template without a cross-tab create action. The empty-state
   CTA therefore only navigates to Chat. Parked Oct 22 2026.

## Verify (no localhost; Vercel preview only, per CLAUDE.md)
- Phase 1: preview on a phone. Switch Invoices/Quotes and each filter; deep links from the Books "Still owed" tile;
  Open total equals Books "Still owed"; Invoices tutorial walkthrough still anchors; Reduce Motion; swipe between tabs unaffected.
- Contrast: body text >= 4.5:1 on cream (`on-surface-variant` passes); status chips icon + text.
- Preview writes real rows to prod: use an obvious test client name and list the test rows for soft-delete.
- Phase 2: confirm migration state with `npx supabase migration list`, never from local files.
