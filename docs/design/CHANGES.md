# Bank tracking UI — overrides to SPEC.txt

Phone-testing fixes from the founder, Oct 30 2026. **These override
`docs/design/SPEC.txt` wherever the two disagree.** Other agents: do not revert
any of this back to SPEC without a newer instruction from the owner.

Phase 1 is still mock-only. Nothing here writes to Supabase (the structural test
`src/lib/bank-tracking.test.ts` enforces it).

1. **One X.** The per-card X is gone. Only the sheet's top-left X closes the
   stack, and it does so with the dismiss animation: the sheet shrinks and flies
   to the visible Books nav item, which pulses. There is no hidden state any
   more — an item you didn't resolve stays in To review, so closing loses
   nothing. SPEC's "hide for now" card action and its hidden queue are retired.

2. **Hidden is replaced by Ignored.** The stack's two tabs are `To review N` and
   `Ignored N`. Don't add / Keep moves the item to Ignored; those cards carry a
   Restore button that puts the item back in To review. Ignored items never
   count toward the nav dot, the Spent dot, the pinned row or the Books
   footnote. When To review reaches 0 the sheet shows All caught up and does NOT
   auto-dismiss while Ignored has items (the owner may still restore one). If
   the stack is closed with To review == 0, Ignored items become final and the
   Ignored tab disappears; closed with To review > 0, Ignored persists.

3. **Two buttons, never three.** Both stack full-width, sized like today's
   secondary button — no side-by-side grid. A card with a Possible match
   strip shows Add to record + Already recorded; a card with no match shows
   Add to record + Don't add. The needs-review variant keeps its fixLabel +
   keepLabel pair unchanged.

4. **No letter tile on expense cards.** The W / L / M tile is removed there; the
   merchant name is 28–30px and the card carries a little more vertical padding
   so nothing looks missing. The account line (Chase ••4821) stays under the
   name.

5. **Toast position and dismissal.** The toast sits at the top of the sheet, just
   under the counter, not at the bottom (it must never cover an action button).
   Tapping anywhere dismisses it immediately; it still auto-dismisses after 2.4s.

6. **Tab presses close the stack.** Tapping any nav tab, rail item or sidebar
   item while the stack is open closes it with the slide-down (no card flight)
   and then navigates. Unresolved items stay in To review and the dots stay.

7. **Back gesture.** Opening the stack pushes one history entry. Phone back
   swipe / browser back pops it and closes the stack exactly like a tab press;
   closing it programmatically removes that entry cleanly. It must never re-open
   by itself after a dismissal: any dismissal (X, back, tab press, caught up)
   suppresses the auto popup until a new app open or new items.

8. **Card swipe and counter.** Swipe left = next card, right = previous
   unresolved card; at the first or last card it rubber bands and springs home.
   The counter counts position within the remaining To review stack ("1 of 7",
   never "1 of 9" while To review says 7).

9. **Spent dot.** A red `--oi-alert` dot shows on the Spent row of Books whenever
   To review holds at least 1 expense. It is derived from state (same rule as the
   nav dot) and clears at 0. Collected gets the same dot in phase 2 — not built
   now. No dots on the Expenses page itself: the pinned row is enough there.

10. **App-open popup.** The stack auto-opens on app open on any tab (Chat
    included) when To review holds items that are new since the last dismissal;
    leftover older items re-open it at most once per day. It never opens while a
    voice recording, a text entry, an open sheet, an invoice/estimate builder or
    a deep-linked sub-screen is in play — it waits until the screen is clear,
    then opens. Free users (`?bankTier=free`) and the flag-off build never see
    it.

11. **Signed out, the whole feature is inert.** Nothing bank-related renders
    until a Supabase session exists: no app-open popup, no nav/Books/Spent red
    dots, no Settings row badge, no Books footnote or reconnect banner, and no
    pinned row on Expenses. Signing out closes an open stack and keeps the popup
    down; signing in again behaves like a fresh app open. Reading the session is
    the only thing bank code touches — still no network call and no database
    write, which the structural test enforces.
## Oct 30 addendum (Money In + Books)

Same phone-test batch, money-in round. **These override the mockups in
`docs/design/money-in-books/` and the Notion money-out spec wherever they
disagree.** Where a screen ships slightly differently, this list is the reason —
do not restore the mockup.

**A. The "Unaccounted for" row is pinned, for expenses and for income.** A soft
red icon tile with a red icon, the amount set in ink (never red), and the line
"not in your totals" underneath. It is a status row, not an alarm: nothing in it
is counted in any figure. This is what the red Books badge reports — red marks
money the owner has not decided about, and it clears only when the row empties.
Overrides the mockup's placement of the row and the Notion note that calls it
neutral. Colour rule: soft tile + red icon, black amount.

**B. An expense card with a possible match is text-only, two buttons.** The match
box is text; there is no inline Link button inside it. The buttons stack
full-width and there are exactly two: **Add to record** + **Already recorded**.
With no match the pair is **Add to record** + **Don't add**. Never three buttons
on an expense card. (Restates item 3 for the match case, so the exception cannot
be re-read as a third action.)

**C. Summary chart, Weeks grain.** The data is inset about 3% from both edges so
the first and last points are not standing on the axis; the first and last points
ease in instead of starting at a cliff. A peak label that would collide with a
y-axis label shifts right rather than overlapping it or being dropped.

**D. One readable green.** **#2f6b3f** is the only green for green text, the dots
and the chart ridge. **#6f9a78** is a fill green only — chart fills and the
money-in pulse. Never the lighter green on type; it does not read at 13px.
