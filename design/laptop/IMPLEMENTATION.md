# SCOPE OVERRIDE (read first, supersedes anything below that conflicts)

THIS ROUND IS LAPTOP ONLY. iPad (portrait and landscape) is a later round.
- "Laptop" = viewport width >= 1280 (Tailwind `xl:`). Apply every laptop layout behind `xl:` (or a container query that only triggers at laptop widths). Below 1280, every screen must stay EXACTLY as on `feat/responsive` today (phone, iPad Mini/Air/Pro in both orientations, small windows).
- Ignore the iPad split rule in section 3 for now. The Invoices split view turns on at `xl:` (1280+). Single column below.
- Paywall and tutorial laptop versions also apply at `xl:` only; below 1280 keep the current behavior.
- Verify at 1280x800 and 1440x900 (laptop) plus 390, 768, 1032 and 1180 as REGRESSION checks (these must be pixel-identical to `feat/responsive`).
- Design files for this round: `design/laptop/` (tutorial HTML, paywall HTML, screenshots). If they are missing, STOP and ask.

---

# TASK FOR FREEBUFF: Implement the Claude Design laptop/iPad UI in the On It repo

Repo: `dynastyweb26/-on-it` (Next.js 14 App Router, Tailwind 3.4, Supabase, Vercel). Vercel project `on-it`.
You are implementing a PRESENTATION-ONLY change: layout and component structure to match a finished design.
Be thorough and specific. Do not guess; read the design files and extract exact values. If something is unclear, STOP and ask instead of inventing.

---------------------------------------------------------------------
## 0. HARD RULES (non-negotiable)

1. Presentation only. NO changes to: database, Supabase queries or schema, migrations, auth, Stripe or payment logic, API routes, `SECURITY.md` rules, copy (text), colors, fonts, icons, or business logic. If a layout needs data the component does not have, stop and report it.
2. Phone must not change. At widths below 768 every screen must render exactly as it does on `feat/responsive` today. Prove it (section 9).
3. NEVER commit to or push `main`. NEVER run `vercel --prod`, `vercel alias set`, `supabase db *`, or any migration command.
4. Work on a new branch `feat/laptop-ui`, created from the current tip of `feat/responsive` (it already has the icon rail, the 288px sidebar, `PageContainer`, container queries, and centered dialogs for sheets). Do not rebase onto main.
5. One commit per discrete item (list in section 8). Commit message ends with a blank line then your own attribution if you have one.
6. Audit before editing: read every file you will change, in full, before touching it. Do not re-read files you already read unless they changed.
7. No new dependencies unless unavoidable; ask first. `@tailwindcss/container-queries` is already installed.
8. Colors/tokens: use only existing Tailwind tokens from `tailwind.config.ts` (background `#fff8f0`, on-background `#1f1b13`, primary-container `#d4af37`, etc.). NO new hex values. Gold `#d4af37` is a FILL with dark text only, never text, never white on gold.
9. Icons: Material Symbols OUTLINED via `src/components/Icon.tsx`. The design files use "Rounded"; that is a mockup artifact. Keep Outlined.
10. Every animation needs a reduced-motion still state (existing rule; `globals.css` already handles `prefers-reduced-motion`).
11. Test only on Vercel preview deploys, never localhost. Do not run `npm run dev`.
12. Token budget: reports max 15 lines. Run the full build once per commit. Pipe long output through `tail`/`grep`. Screenshots only when layout changed.

---------------------------------------------------------------------
## 1. SOURCE OF TRUTH (read these first, in this order)

1. `CLAUDE.md`, `SECURITY.md`, `PUNCH-LIST.md`, `RESPONSIVE-SPEC.md`, `ON-IT-DESIGN-STANDARD.md`, `MOTION-SPEC.md`.
2. `design/laptop/` (the design files; the owner commits them here):
   - the tutorial HTML (laptop scenes: Clients, Invoices, Books, Chat, Settings tours + end card)
   - the paywall HTML (laptop card, all slides)
   - any screenshots of the redrawn laptop screens
   - `LAPTOP-SPEC.md` if present
   RULE: where the design HTML and the current app differ, THE DESIGN WINS, except where it conflicts with section 0.
3. The design HTML is a mockup: extract exact values from its CSS (widths, paddings, gaps, radii, font sizes, grid templates, breakpoints) and map them to Tailwind classes using existing tokens. If a value has no token, use an arbitrary value `[..]` only for sizes, never for colors. Write every mapping down in `design/laptop/MAPPING.md` as you go (design selector -> component -> classes).
4. The design shows the app inside a rounded browser-like frame with an outer margin. That frame is the screenshot, NOT part of the UI. Do not build it.

---------------------------------------------------------------------
## 2. WHAT THE DESIGN CHANGES (observed from the finished frames)

Clients (laptop)
- One header row: page title "Clients" + pill tabs (Clients | Products & Services) + search input ("Search N clients") + gold circular "+" button, all on one line.
- List card with letter group headers; an A-Z jump rail on the right edge, inside the card area, vertically centered, as a rounded cream pill with gold ring when spotlighted.
- Rows: avatar initial, name, right-aligned meta ("2 estimates out"), chevron.

Invoices (laptop/iPad) SPLIT VIEW
- Left pane (about 380px): title "Invoices", pill tabs (Invoices | Estimates), filter chips (Pending/Signed, Open/Paid with counts), summary line, "Newest first" sort, month dividers, compact cards.
- Right pane: the detail of the selected invoice or estimate: status chip + number in the top bar, "Record payment" button with amount-due chip top right, big client name + "Amount due", due-date strip, actions row (Download, View PDF, etc.), line items card.
- Selecting a row highlights it and shows its detail in the right pane. Empty state when nothing is selected (see 5.2).

Books (laptop)
- Header row: title "Books" left; "Income & Expenses" (secondary pill) and "Add expense" (gold pill) right.
- Row 1: Net card (dark) spanning left ~2/3; right column: Still owed + Collected tiles over a Spent row.
- Row 2: "View expenses / Recurring expenses" list card (left) and a Recaps card with "Watch again" (right).

Shell
- Sidebar 288px: logo, "How it works" as a dropdown pill (chevron) that opens the tour picker, nav items with gold pill for active, compact install card pinned at the bottom (icon + text on two lines + Install button, no wrapping).

Other screens redrawn in the HTML (Chat, Settings, Recaps, paywall slides, success card): see section 6. Read the HTML to find every scene.

---------------------------------------------------------------------
## 3. BREAKPOINT AND SPLIT RULE (decided by the owner)

- Phone (<768): bottom tab bar, unchanged.
- 768-1023: 80px icon rail (already built).
- 1024+: 288px sidebar (already built).
- SPLIT VIEW applies on iPad AND laptop, driven by the CONTENT area width, not the viewport, so it works with either nav:
  `@container` on the page wrapper, split when the content area is >= 700px, i.e. Tailwind arbitrary container query `@[700px]:`.
  Resulting behavior: iPad Mini portrait (768 - 80 rail = 688) = single column (list, tap opens detail as today). iPad Air portrait (820 - 80 = 740), iPad Pro portrait (1032 - 288 = 744), iPad landscape (1180 and 1366) and laptop (1280, 1440) = split.
- Do not put `@container` on an element that has `position: fixed` descendants (container-type creates a containing block and will break sheets). Put it on a dedicated inner wrapper only around the split/grid.

---------------------------------------------------------------------
## 4. SHARED PATTERNS TO BUILD FIRST (one commit each)

Create under `src/components/layout/` (or extend `PageContainer`). Build each, use it on at least two screens, no copy changes.

1. `PageHeader`: ONE row: [back (when nested)] [title] [slot: tabs/search] [actions right-aligned]. Replaces the current "back arrow alone in a full-width bar, title on a second row". Phone keeps the current header exactly (render the old structure below `md`).
2. Content column widths via the existing `PageContainer` (wide 1152, default 1024, narrow 896). Titles must start at the same x on every screen inside the content area.
3. `SplitView`: props `list`, `detail`, `emptyDetail`. Container-query switch at `@[700px]`. List pane fixed 360-400px with its own scroll; detail pane flex-1 with its own scroll. Both panes scroll independently. Single column below the threshold.
4. `ListRow` (hover state, focus ring, chevron, right-aligned meta) for lists that stretch (Recurring, Expenses, Clients).
5. Tour picker as a dropdown anchored under the sidebar "How it works" pill (the component `src/components/tutorial/TourPicker.tsx` already is a menu: restyle only; keep arrow-key, Esc, focus return).
6. `Sidebar` install card compact layout (two-line text, no wrapping).

---------------------------------------------------------------------
## 5. SCREEN-BY-SCREEN

Work in this order. For each: read the file fully, read the matching design scene, implement, preview, compare, commit.

### 5.1 Clients: `src/components/tabs/ClientsView.tsx`, `src/components/clients/ClientsList.tsx`, `ProductsList.tsx`
- Single header row (pattern 1) with `PillTabs`, search, "+".
- A-Z rail: keep existing behavior, reposition per design. The coach-mark anchors `clients-list`, `clients-add`, `clients-empty-add` must remain on the elements named.
- Pill tabs width ~320-400px, NOT full width.

### 5.2 Invoices SPLIT: `src/components/tabs/InvoicesView.tsx`, `src/app/(app)/invoices/page.tsx`, `src/app/(app)/invoices/[id]/page.tsx`, `src/components/estimates/EstimateDetail.tsx`, `src/components/invoice-detail/*`
THIS IS THE BIGGEST ITEM. Audit first and write your plan in the commit description before coding.
- Today the detail is a separate route `/invoices/[id]` (and estimates inside it). Do NOT change what the route renders on narrow widths.
- Extract the detail body from the route page into a component usable inside the split pane (no logic changes, same props/data hooks).
- On wide content (>= 700px): list left, detail right. Selecting a row updates the URL (`/invoices/[id]`, push or replace, so back/forward and deep links work and refresh keeps the selection) and shows the detail in the right pane without remounting the list (keep list scroll position).
- On narrow content: unchanged (tap row -> full detail page).
- IMPORTANT interaction: the tab deck (`src/components/tabs/TabDeck.tsx`, `src/lib/swipe.ts`, MOTION-SPEC section 17) mounts tab panels and gates route effects by an `active` prop; nested detail routes use the older pre-deck path. Read both before designing the route integration. On laptop (mouse) there is no swipe; do not break the touch path on iPad (swipe must still work on the list pane's non-scrolling areas and `data-no-tab-swipe` / `data-tab-scroll-owner` rules must stay).
- Empty detail state when nothing is selected: use copy from the design if it exists; if the design has none, use NO new copy: render an icon-only placeholder and report it.
- Keep these anchors: `invoices-filter`, `invoices-list`, `invoices-empty`, and the tutorial targets named in `data.ts` for the invoice scenes (`invCard`, `dueBadge`, `recordPay`, etc.; grep `data-coach` and the selectors in `coach-marks.ts`).
- Record payment sheet (`RecordPaymentSheet.tsx`) already opens as a centered dialog at md+. Keep.

### 5.3 Books: `src/components/tabs/BooksView.tsx`
- Header row with actions right (Income & Expenses, Add expense). On phone keep the current layout.
- Net card + tiles grid per design using the existing `@container` wrapper (do NOT use viewport `lg:`); list card and Recaps card side by side at `@4xl` and stacked below.
- Keep `books-net`, `books-stats`, `books-add-expense` anchors.
- Fix known issue: `BooksDot` offsets (`right-[13px] top-0.5`) are designed for the bottom-tab pill and are misplaced in the sidebar (`src/components/app/AppShell.tsx`). Position it correctly for sidebar and rail.

### 5.4 Chat: `src/components/tabs/ChatView.tsx` (very large file; change ONLY wrapper/layout classes)
- Message column max ~720px centered; the composer shares the SAME left/right edges as the message column.
- Header actions (new chat, history) sit in the shared page header row at md+, not floating at the far right. Phone unchanged.
- Keep `chat-composer`, `chat-camera`, `chat-messages` anchors. Do not touch the thinking spinner, card build-in, lock sweep, mic listening, or keyboard-fit logic.

### 5.5 Settings and inner pages (Settings home and sections, Payouts, Plan, Help, Recurring, Expenses, Books summary, Client detail/edit/new, Product pages)
- Apply `PageHeader` + `PageContainer` so every title lines up. List pages use `ListRow`/table style. No new content.
- Settings home may use a two-column master/detail on wide content if the design shows it; otherwise a single centered column.

### 5.6 Recaps: `src/components/recap/*`
- Re-compose per design for wide screens (centered stage or wide layout). KNOWN BUG to fix: on the Money Out slide the receipt tickets render skewed across the whole width because their geometry is computed from the viewport width. Make that geometry depend on the stage width (or cap the stage at a phone-like width, centered). Keep all slide animations and timings.

### 5.7 Sheets: already centered dialogs at md+ (15 sheets). Verify against the design's dialog sizes; adjust max width only if the design shows a different one.

### 5.8 Shell: `src/components/app/AppShell.tsx`, `src/components/InstallBanner.tsx`
- Dropdown "How it works" pill (pattern 5) and compact install card (pattern 6). Keep the rail version at 768-1023 (icon-only).

---------------------------------------------------------------------
## 6. PAYWALL AND TUTORIAL (read carefully)

Paywall: `src/components/PaywallModal.tsx`, `src/components/paywall/{ShowcaseStep,PaywallDemo,TrialStep,PlanStep,FitToHeight}.tsx`, `src/lib/paywall-copy.ts`
- Currently: portal to `document.body`, centered card at md+ (max-w-md, up to 860px tall), steps 1-2 scale to fit via `FitToHeight`, step 3 scrolls.
- Rebuild the laptop version from the paywall HTML: a wide card (copy on one side, animated demo on the other, or exactly what the HTML shows). Show ALL slides: Say it (voice), Estimate approved, Payment apps (empty AND filled states), Weekly recap, Trial timeline, Plan (testimonial, reminder toggle, code field, comparison table, pinned Start trial), and the success card ("You're on it", "Make an invoice").
- Rules: steps 1-2 stay single non-scrolling pages that fit 1440x900 and 1280x800 with no inner scroll (use `FitToHeight`; MIN_SCALE 0.6). Step 3 scrolls inside the card. Keep all demo animations, timings, keyframes and reduced-motion states. Keep the narrow layout below 768 exactly as it is.
- The top "reason" pill varies by trigger (`REASON` map in `paywall-copy.ts`): invoice, expense, estimate, recurring, reports, winback. It must hold the longest string on one line.
- Do not change copy, plans, prices, trial logic, Stripe calls, or `PaywallVariant` handling.

Tutorials: TWO systems exist. Read both before editing.
1. `TutorialOverlay.tsx` + `data.ts` + `mock/*` (BooksMock, ChatMock, ClientsMock, InvoicesMock, SettingsMock, MockChrome, MockScreen): a full-screen animated tour that plays on MOCK screens (timed actions, typing, count-ups, simulated taps, Next/Back/Skip, end card). 5 tours, 21 scenes.
2. `CoachMarks.tsx` + `CoachMarkOverlay.tsx` + `coach-marks.ts`: a live spotlight over REAL DOM elements found by selector (`data-coach`), tooltip placed above/below/side, re-measured on resize.
- The Claude Design tutorial HTML defines the laptop version. Implement it in whichever system each scene belongs to: laptop mock screens in `mock/*` should be redrawn to match the new laptop layouts (e.g. Invoices mock becomes the split view); coach-mark tooltips get left/right placement on wide screens.
- Required additions on laptop: arrow keys for Next/Back, Esc = Skip, visible focus on tooltip buttons, reduced-motion still states. Keep spotlight sweep and ring pulse timings.
- Targets: the design file uses names like `composer`, `statusTabs`, `net`, `invCard`, `dueBadge`, `recordPay`, `payApps` (about 40). The app uses `data-coach` names (`chat-composer`, `invoices-filter`, `books-net`, ...). Map every target in the HTML to a real selector, list unmapped ones in your report, and add a `data-coach` attribute only where an element exists but has none. Do not rename existing attributes (tests in `coach-marks.test.ts` depend on them).
- Tour picker labels and order come from `data.ts`; do not add copy.

---------------------------------------------------------------------
## 7. KEEP-WORKING CHECKLIST (do not break)

- Tabs, bottom tab bar, tab deck swipe on touch, edge rubber band (MOTION-SPEC 17).
- Sheets that pin above the keyboard (`data-kb-fit`), `data-no-tab-swipe`.
- Swipeable rows on touch; on laptop expose the same actions on hover (only if the design shows it; otherwise leave).
- `PageContainer` and the container queries from `feat/responsive`.
- Existing tests: `npm test` must stay green (650 passing). Run `npx tsc --noEmit` before every commit.

---------------------------------------------------------------------
## 8. COMMIT PLAN (one commit each, in order)

1. docs: add `design/laptop/MAPPING.md` + `LAPTOP-SPEC.md` + `design/laptop/diff.config.json` (source of truth note; update `PUNCH-LIST.md` and `CLAUDE.md` pointer lines)
2. feat: `PageHeader`
3. feat: `SplitView`
4. feat: `ListRow`
5. feat: shell (How it works dropdown, compact install card, BooksDot fix)
6. feat: Clients
7. feat: Invoices split view (+ estimates)
8. feat: Books
9. feat: Chat layout
10. feat: Settings + inner pages
11. fix: Recaps wide layout + Money Out ticket geometry
12. feat: Paywall laptop (all slides + success card)
13. feat: Tutorial laptop (mocks + coach marks + keyboard)
14. test: wire `npm run design:diff` cases for Clients, Invoices, Books, Chat into docs (the script itself already exists)

After each commit: `npx tsc --noEmit`, `npm test` (tail), push `feat/laptop-ui`. Do not wait for approval between commits unless something in section 10 triggers.


---------------------------------------------------------------------
## 8b. ANTI-DRIFT RULES (read before coding; these are the usual failure modes)

PORT, DON'T REINTERPRET.
1. Copy the design's `@keyframes`, animation shorthand values, easing curves, durations, delays and class names VERBATIM into the app (a CSS module or a section of `globals.css`). Do NOT rewrite an animation in your own style, convert a keyframe animation into a transition, shorten a duration, drop `infinite`, or "simplify" a sequence. A static result is a failure.
2. Mirror the design's DOM structure in JSX (same nesting, same wrappers, same order). Use the same class names where practical so the diff tool can pair elements.
3. Use flex/grid/container queries as the design does. Do not hard-code pixel widths where the design uses flex, and do not add fixed heights the design does not have.
4. Do not restyle anything the design does not show. Do not add features, tooltips, or hover effects the design lacks.
5. If an animation in the design is driven by JS (typing, count-ups, simulated taps, timed scenes), find the app's existing equivalent (`TutorialOverlay.tsx`, `PaywallDemo.tsx`, `mock/*`) and keep its timeline. Port the timing values from the HTML.
6. One screen at a time. Finish a screen, run the diff gate (below), fix, commit, then move on. Never batch several screens in one commit.

THE DIFF GATE (mandatory before every UI commit)
`scripts/design-diff.mjs` compares the design HTML with the preview: element positions/sizes, CSS animation names/durations/iterations/easing, sampled motion (flags "design moves, app is static"), reduced-motion behavior, advisory pixel diff.
- First, author `design/laptop/diff.config.json` from the HTML: for each screen/scene, list the paired elements (design selector -> app selector), the viewport (1440x900 and 1280x800), and `motionTimesMs: [0, 500, 1500]` for animated elements. Include the paywall slides and every tutorial scene. Use `check: ["w","h"]` for elements whose position legitimately differs. Read the tool header comment for the exact schema. Commit this config in the docs commit (1) and keep it updated.
- Prove the tool works on your machine once: `node scripts/design-diff.mjs --selftest` (faithful copy must PASS, broken copy must FAIL). If Playwright is missing: `npm i -D playwright && npx playwright install chromium` (do not commit that dependency; use `--no-save`).
- After each push, once the preview is Ready: `node scripts/design-diff.mjs --config design/laptop/diff.config.json --preview <preview-url> --only <case-names>`; also run once with `--reduced`. If the preview needs a login or Vercel protection bypass, use `--storage-state` / `--bypass-token`; if you cannot authenticate, STOP and report instead of skipping the gate.
- Any FAIL = fix before the next commit. Never edit the config to make a failing check pass unless the design file itself proves the expected value; explain any config change in the commit message.
- Paste the PASS/FAIL summary lines into your report.

---------------------------------------------------------------------
## 9. VERIFICATION (preview only)

After pushing, Vercel builds a preview from the branch. Get the unique deployment URL (`on-xxxx-....vercel.app`) from the Vercel dashboard or GitHub check. Verify at these widths with before/after screenshots against the design frames:
- 390 (phone): must be pixel-identical to `feat/responsive` for Chat, Invoices, Books, Clients, Settings. Any diff = a bug; fix it.
- 768 and 820 (iPad portrait), 1032 (iPad Pro portrait), 1180 and 1366 (iPad landscape), 1280 and 1440 (laptop).
Check specifically:
1. Titles start at the same x on every inner page.
2. Invoices split appears at content width >= 700 (820 and 1032 portrait, all landscape), single column at 768; URL updates on select; refresh keeps the selection; back button works; list scroll position is kept.
3. No horizontal scroll at any width. No clipped sheets or dialogs.
4. Paywall steps 1-2 fit with no scroll at 1440x900 and 1280x800; step 3 scrolls inside the card.
5. Every tutorial scene's spotlight lands on its target at 1280 and 1440.
6. Recaps Money Out tickets are no longer skewed.
Test data note: preview and production share one database. Do NOT tap Connect/Finish setup. Do not create or send invoices; use read-only navigation. Do not use the founder's or Cyril's accounts for anything that writes.

---------------------------------------------------------------------
## 10. STOP AND ASK IF

- The design requires data, copy, a route, or a component that does not exist.
- A layout would change phone rendering.
- The Invoices route integration requires touching `TabDeck`/`swipe.ts` behavior beyond reading it.
- A tutorial target in the HTML cannot be mapped to a real element.
- `npm test` fails and the fix is not obviously in your change.
- Anything that looks like it touches auth, payments, DB or security.

---------------------------------------------------------------------
## 11. FINAL REPORT (max 15 lines)
Branch, last commit, preview URL, which items are done / partial / blocked, any unmapped tutorial targets, any copy gaps (empty states), and any screens you could not verify.
