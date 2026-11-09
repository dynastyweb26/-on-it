# Alive Layer fidelity audit (branch feat/alive-fidelity)
> The tables below are the PRE-BUILD audit (what differed before the work). The result of the build, element by element, is in "Final comparison" at the end of this file.

Source of truth: `design/alive-layer/On_It_Alive_Layer.dc.html`, sections 01-08. Base: `feat/alive-fidelity` merged with origin/main 9b9ec0ab (contains af5cfe21, events-server.ts, EventToastHost).
Marks: MATCH / DIFF / UNVERIFIED. UNVERIFIED = code not opened, or not measurable without the preview. Nothing is claimed done on trust.

NOT BUILT by decision: Direction B (dark toast, rays, flecks, 1b/1d), Send receipt, Mark job done, 4B re-sign (6.3 sheet, "Needs re-sign" chip, 6.6), haptics, push, dark mode, "Reset"/"Reset demo", header "?" icon, section 09.

## Icon map (Tabler -> Material Symbols)
Already in `icon-names.ts`: verified, payments, schedule, visibility, link, ios_share, check, refresh, history, receipt_long, person_add, picture_as_pdf, warning, auto_awesome, chevron_right.
MISSING (add + `npm run icons:build`): toll (coins), verified_user (shield-check), find_in_page (file-search), swap_horiz (transfer), notifications_active (bell-ringing), edit_document (file-pencil), person_search (user-search), light_mode (sun), calendar_month (calendar-stats), south_west (arrow-down-left).

## 01 Toast (src/components/events/EventToastHost.tsx, src/lib/events.ts)
| Element | HTML | Code | |
|---|---|---|---|
| Surface | #FFFDF9, 1px #E8DCC6, r20, shadow 0 14 34 -14 rgba(70,50,10,.30) + 0 2 6 rgba(70,50,10,.06), pad 12 12 8, gap 10 | r18, border-outline-variant/70, bg-surface-container-low, shadow-card-raised, px-4 py-3 | DIFF |
| Tile | 40x40 r12, 22px glyph, tint per kind | 26x26 round, gold or neutral only | DIFF |
| Tints | signed #DDF3E5/#1E7A45; paid #F2E6C2/#6E580C; partial #F7EFD6/#6E580C; overdue #F8E1D3/#A8461F; views #EEE7DC/#4A433A | tone gold/neutral | DIFF |
| Title / detail type | 700 15/1.25 ; 13/1.35 #6B6257 | 14.5 semibold ; 12.5 | DIFF |
| Chevron right 18px #A69C8E | yes | X close button (line ~93), no chevron | DIFF |
| Action button | gold pill h40, 700 14.5, "Convert to invoice" | outlined primary/40 pill, 12.5px | DIFF |
| Grab bar | 36x4 #E3D7C3 | none | DIFF |
| Enter / exit | 380ms (.2,.9,.3,1) / 220ms (.4,0,1,1) | 200ms ease-out both | DIFF |
| Dwell | signed 8, overdue 8, paid 5, views 4 | action 8, gold/success 5, rest 4 | MATCH |
| Queue max 3 | yes | QUEUE_MAX 3 | MATCH |
| +N badge | mono 11/700, #1E1A15 on #F4ECDD, r10, inside card | pill outside card, surface-container-high | DIFF |
| Stack back cards | scale .94/.88, y +12/+22, opacity .9/.75 | none | DIFF |
| Tap stack -> "N updates / Clear all", 280ms (.2,.8,.2,1), 8px gaps | yes | none | DIFF |
| Swipe up 32px / 500px/s | yes | 32px, 0.5px/ms | MATCH |
| 96px drag clears all | yes | none | DIFF |
| Pause while finger down | yes | pause/resume present | MATCH (device UNVERIFIED) |
| Stagger 80ms | yes | none | DIFF |
| Tap body opens doc | yes | opens `/invoices/:id` when invoice_id set | MATCH (estimate target UNVERIFIED) |
| Position | top 54 in phone, over header | fixed top-[72px] | UNVERIFIED |
| Copy: signed | "Ruth signed your estimate" / "E-0049 · $50.00 · just now" | title MATCH; detail = doc · amount · method, no "just now" | DIFF |
| Copy: paid | "Ruth paid $50.00" / "INV-0032 · Zelle · paid in full" | `paid_in_full` -> "{name} paid in full"; `payment_recorded` -> "{name} paid $X" / doc · method | DIFF |
| Copy: partial | "Ruth paid $25.00 of $50.00" / "INV-0032 · $25.00 left" + 5px bar | none | DIFF |
| Copy: deposit | chat card "$25.00 deposit from Ruth" / "INV-0032 · $25.00 due on completion" | "{name}'s deposit is in" | DIFF |
| Copy: overdue | "Brandon's invoice is overdue" / "INV-0029 · $150.00 · 3 days late" | identical | MATCH |
| Copy: est. opened | "Chenyi opened your estimate" / "... · 2nd time today" | title same; no "2nd time today" | DIFF (detail) |
| Copy: inv. viewed | "Maryam viewed her invoice" / "INV-0030 · $150.00 · due Nov 14" | "{name} opened your invoice" | DIFF |
| Icons | rosette-discount-check, cash, coins, clock-exclamation, eye, file-search | verified, payments, savings, schedule, visibility, visibility | DIFF (toll, find_in_page) |

## 02 Copy link / Share (src/components/estimates/EstimateLinkActions.tsx)
| Element | HTML | Code | |
|---|---|---|---|
| Tile h64 r16, gap 4, 20px icon, 14px | yes | h-16 rounded-2xl gap-1, 14px | MATCH |
| Press scale .97 90ms | yes | active:scale-[.97] 90ms | MATCH |
| Copied: gold check pop (320ms, .2,.9,.3,1.2), ring 12px/500ms, label fadeUp | yes | onit-confirm-pop/ring/in (globals.css:817) | MATCH |
| Flip out/in 140/180ms | label out y -14; in y +14->0 180ms | single `onit-confirm-in` 180ms, translateY 14; no out animation | DIFF |
| Hold 1.6s | yes | CONFIRM_MS 1600 | MATCH |
| Copied bg / border | #F2E6C2 / #D4AF37 | primary-soft / primary-container (token hex UNVERIFIED) | UNVERIFIED |
| URL line | mono 12 #6B6257 clipboard-check icon, BELOW buttons, only after copy; "onit.dynastyweb.co/e/7Kq2 copied" | check icon, ABOVE buttons; the raw URL is shown at all times before copy | DIFF |
| Shared + assistant line | "Shared. I'll ping you as soon as Ruth opens it." | "Shared. I'll let you know as soon as Ruth opens it." | DIFF (copy) |
| Footer row Preview / Revise | yes (eye, pencil) | none; estimates have no Revise since af5cfe21 | DIFF |
| Card head: chip "● Ready to share" + E-0049, name 19px h, "Estimate · 1 item · valid until Dec 7", amount 30px #6F5B0B | yes | "Ready to share" label exists (ChatView:240); layout UNVERIFIED | UNVERIFIED |

## 03 Card line items
| Element | HTML | Code | |
|---|---|---|---|
| Grid 18px / minmax(0,1fr) / auto, gap 3px 10px, desc clamp 3, price nowrap tabular-nums, qty x rate sub-line 12.5 #7A7166 | yes | UNVERIFIED (chat card item rows not opened) | UNVERIFIED |
| Photo grid | unchanged | n/a | MATCH |

## 04 Payment moments and PDF/send
| Element | HTML | Code | |
|---|---|---|---|
| Chat card: Deposit received (meta line, title, "Deposit" chip, detail) | yes | generic EventCard | DIFF |
| Chat card: Payment recorded, "Partial" chip, 6px bar, "{n} left" | yes (Send receipt NOT BUILT) | none | DIFF |
| Chat card: Paid in full (A), 56px disc, check draw, h19, "Paid" chip | yes | none | DIFF |
| Invoice screen: "Payment recorded" undo row | yes | present (InvoiceDetailScreen.tsx:1174) | MATCH (sizes UNVERIFIED) |
| Invoice screen: Balance due / Paid in full labels | yes | present (:990-996) | MATCH (copy), celebration disc DIFF |
| Invoice screen: deposit state ("Deposit paid" chip, "Due when the job's done", bar marker, ✓ line) | yes (Mark job done NOT BUILT) | "Deposit's in." line only (:1161) | DIFF |
| Celebration: once, ~900ms, disc + check + halo, balance count to $0.00 | yes | none | DIFF |
| PDF states 1-5 for invoices | yes | PdfChoiceSheet.tsx exists; send wiring UNVERIFIED | UNVERIFIED |

## 05 Record payment confirm card (src/components/chat/PaymentProposalCard.tsx)
| Element | HTML | Code | |
|---|---|---|---|
| Heading "Record this payment?" / "Nothing's saved until you confirm." | yes | footer reads "Nothing is saved until you tap Confirm." (:234); heading UNVERIFIED | DIFF |
| Rows Client (initials avatar), Invoice (mono + total), Amount, Method chips, Date | yes | stacked labelled inputs, `rounded-input min-h-touch` | DIFF |
| Amount field gold ring 1.5px #D4AF37, bg #FFFBF0, halo 3px | yes | ring-2 ring-primary-container | DIFF |
| "After this, X owes $Y" live | yes | UNVERIFIED | UNVERIFIED |
| Confirm label | "Confirm $25.00" | `Confirm ${money(amount)}` | MATCH |
| Saving | spinner "Saving…", Cancel dims | "Recording…" | DIFF |
| Cancelled one-liner + Undo | yes | UNVERIFIED | UNVERIFIED |
| Ambiguity picker | yes | UNVERIFIED | UNVERIFIED |
| Over-balance guard | not in design | exists (overpay disables Confirm) | keep, ADDED-by-earlier-work |

## 06 Revise in place
| Element | HTML | Code | |
|---|---|---|---|
| Chat card Revise (6.4), gold ring | Preview / Revise / Copy link | removed (ChatView.tsx:4396 "an estimate has no revise") | DIFF |
| Detail screen edit mode (version badge, "Same link, updated." note, save bar, inline edit, Previous version) | 6.1 / 6.2 | No UI on this base (versions + lock exist in DB/routes from 4A; edit UI not found in InvoiceDetailScreen) | DIFF |
| "Tell Maryam" / "Not now" after save | yes | none | DIFF |
| Signed copy | "This estimate is signed and locked." (owner rule) | UNVERIFIED | UNVERIFIED |
| 6.5 client "Updated Nov 8" | red chip #FBE4E1/#B8202A + notice box | `Updated` span with `s.validity` style (EstimateView.tsx:198) | DIFF |
| 6.3, 6.6 | NOT BUILT | - | NOT BUILT |

## 07 In-chat event cards (src/components/chat/EventCard.tsx)
| Element | HTML | Code | |
|---|---|---|---|
| Anatomy | avatar + wcard #FFFDF9 r18; 36px tile; 15/700 title; 13 detail; chevron | no avatar, no tile, 18px bare icon, timestamp at right, `rounded-2xl` | DIFF |
| Tints per kind | as 01 | gold/neutral | DIFF |
| Action button | gold h38 pill + icon (swap_horiz / notifications_active) | outlined pill right-aligned, "Working…" | DIFF |
| Convert: idle / "Creating INV-0032…" spinner / "INV-0032 created" check row | yes | UNVERIFIED (not found in EventCard; action handled by caller) | UNVERIFIED |
| Chip crossfade SIGNED->CONVERTED 200ms + 2 halo pulses | yes | none | DIFF |
| Assistant context lines | yes (sometimes) | none | DIFF |
| `estimate_signed` written on sign | required | NOT written: sign route only calls `notifyClaimed` | DIFF |
| `estimate_viewed` skips signed and <2 min after send | required | skips drafts and owner views only | DIFF |
| Recap cards (daily/weekly, in chat) | yes | `src/components/recap` is the "Wrapped" story (RecapsCard etc.), not in-chat cards | DIFF |

## 08 "?" reply and empty state (src/lib/chat-commands.ts, ChatView.tsx:4626)
| Element | HTML | Code | |
|---|---|---|---|
| Chip text | 'Estimate for Ruth, deck repair, $800' / 'Ruth paid $25 Zelle' / 'Who owes me money?' | 'Invoice a client' / 'Who owes me money?' / 'Record a payment' | DIFF |
| Chip icon | sparkles #B8961E | none | DIFF |
| Chip style | min-h40, r20, #fff, 1px #E3D6C0, 600 14/1.3, pad 9/14 | rounded-full, bg-surface-container, 13.5px | DIFF |
| Tap fills the input, no send | yes | `send(chip)` | DIFF |
| Position | after the greeting, padding-left 36 | rendered above the greeting message | DIFF |
| Vanish after first message | yes | `messages.length === 1` | MATCH |
| Hint | "Send ? to see everything I can do" (owner decision) | same string, 12.5px | MATCH (style UNVERIFIED) |
| Card title + sub | "What I can do" / "Tap one to start. Edit it, then send." | identical | MATCH |
| Groups | Create, Money, Clients, Recaps; rows with 30px tile + name + quoted example + south_west | "Send a reminder" commented out; Recaps group absent; rows have no tile, no arrow, example not quoted | DIFF |
| Row tap fills the input | yes | `onPick(ex)` | MATCH (caret/keyboard UNVERIFIED) |
| Triggers | "?", "help", "what can you do" | `matchCommand` | MATCH |

## Items 1-2 (backend, allowed by the owner for this pass)
| Item | State |
|---|---|
| 1 sign route writes `estimate_signed`, dedupe `estimate_signed:${estimate_id}` | absent |
| 1 viewed route skips approved_at and views <2 min after send | absent |
| 2 `/api/events/test?kind=` | route posts only `payment_recorded` |

---

# Final comparison (after the build, 2026-11-09)

Marks: MATCH = values copied from the HTML and checked in code. DIFF = does not match, with the reason. UNVERIFIED = not seen running. Nothing below was viewed on a phone yet: "MATCH" means the code carries the design's values.

## App-wide DIFFs that cannot match without a decision
- **Fonts.** The design uses DM Sans and JetBrains Mono. The app loads Inter and IBM Plex Mono. I used the app's fonts everywhere. Matching needs two new webfonts: your call.
- **Pronouns.** The design writes "viewed her invoice", "nudge him", "once she opens it". The app does not know a client's pronouns, so every one is the name or "they"/"their".
- **Owner name.** "Good morning, Cyril." and "Cyril updated this estimate": the app has the business name, not the owner's first name, so recaps say "Good morning." and the client page says "<business name> updated this estimate."
- **Invoice number before it exists.** "Creating INV-0032…" cannot show the number (the server assigns it on insert), so it reads "Creating invoice…" and the check row then shows "INV-0032 created".
- **Tabler icons** are Material Symbols (the mapping you gave); a few glyphs differ in shape.
- **Design tokens.** The design's hexes are not the app's Tailwind tokens, so they live as `--al-*` in `src/components/alive/alive.css` (design/tokens.css is a Tailwind v4 file the app does not import).

## 01 Toast: EventToastHost.tsx
MATCH: surface, radius 20, shadow, padding 12/12/8, gap 10; 40px tile r12 with per-kind tints; title 15/700, detail 13; chevron or +N badge inside the card; gold Convert button h40; 36x4 grab bar; enter 380ms (.2,.9,.3,1) with the shadow over the last 120ms; exit 220ms (.4,0,1,1); dwell 8/8/5/4s; queue of 3; back cards .94/.88, y 12/22, opacity .9/.75; tap-the-stack fan-out (280ms) with "N updates / Clear all"; swipe up 32px or 500px/s, 96px clears; clock paused under a finger; 80ms stagger; tap body opens the document; button runs the action.
DIFF: position is `safe-area + 4px` (design: 54px inside a phone mock whose status bar is simulated): UNVERIFIED against the real header. The blurred feed behind the expanded stack is a 1.5px backdrop blur over a cream wash, not the design's opacity .6 on the feed itself. The overdue toast has no button, as in the HTML, so "Send reminder" lives only on the chat card. A deposit toast has no design; it uses the chat-card wording.
Copy: signed, paid ("paid in full" on the detail line), partial ("paid $25.00 of $50.00 / $25.00 left" with the 5px bar), overdue, opened your estimate (+ "2nd time today", counted over the last 24 hours, not the calendar day), viewed their invoice (+ due date): MATCH apart from the pronoun.

## 07 Event cards: EventCard.tsx
MATCH: avatar lane (28px, ring + gold dot), #FFFDF9 card r18, 36px tile and tints, title/detail, chevron, gold action button (Convert to invoice / Send reminder), pressed state (scale .98, #F6EEDF), partial bar with the 6px grow, deposit card, paid in full (56px disc, ring .4s, check .36s, chip pop .3s at .4s, plays once and only for an unseen card), the Convert flow (idle / spinner / check row), idempotent, error names the cause, paywall opens the estimate; chip crossfade SIGNED to CONVERTED 200ms plus two halo pulses; "Now INV-… · open invoice" line on the estimates list; assistant lines for overdue and deposit. Cards now persist across a refresh (fixed first).
DIFF: the estimates-list card keeps the app's own list-row styling and its 24px chip (design shows a 26px .chip); only the halo and the line were added. The thank-you line after paid in full is omitted (it offers a receipt, which is NOT BUILT).

## 04 Payment moments: PaymentFigure, PaymentCard, EventCard
MATCH: partial (Balance due 44px #6F5B0B, 8px bar, "paid / of" row, "Payment recorded" row with Undo, Payments card with Remaining); paid in full 1c (84px disc, halo, drawn check, "Paid in full" 24px, "$50.00 from Ruth · Zelle", Balance $0.00 rolling down, bar to 100%, chip pulse; once, only on the payment that closes it); deposit (shield chip, "Due when the job's done", marker on the bar, Deposit/Balance row); chat cards for deposit, partial and paid in full.
NOT BUILT by decision: Send receipt, Mark job done and the deposit note that points at it.
DIFF: the design loops the bar/disc animation so it can be read; the build plays once. The invoice screen still carries the app's due-date row, quick-action tiles and secondary actions under the figure card. A "View payments" button stands in for the two-button row.

## 05 Record payment confirm: PaymentProposalCard.tsx
MATCH: heading and subline copy, rows with dashed rules, initials avatar, invoice row, gold-ringed amount (1.5px #D4AF37, #FFFBF0, 3px halo), method chips in the design's chip style, date row, live "After this, X owes $Y", "Confirm $25.00", "Saving…" with spinner and dimmed Cancel, collapsed "Cancelled. Nothing saved." with Undo, picker for two clients or two invoices. Over-balance guard kept.
DIFF: methods are the app's seven, so the chip row wraps (the design shows four). The client name is an editable field styled as text. Date opens the native picker.

## 08 Empty state and "What I can do": ChatView, CommandCard
MATCH: chips after the greeting, indented 36px, sparkle icon, the design's three phrases, a chip fills the input and does not send, chips and hint vanish after the first message, hint "Send ? to see everything I can do" (your decision; no ? icon), card in the assistant lane, 30px tile rows with the quoted phrase and a south-west arrow, pressed #F2E6C2, Recaps group.
DIFF: "Send a reminder" and "Look up a client" are NOT shown: no path backs them (reminders reuse Request balance; there is no per-client lookup). The daily and weekly recap rows do work.

## 02 / 03 Ready to share: ReadyEstimateCard, EstimateLinkActions
MATCH: chip + number, client 19px, "Estimate · N items · N photos · valid until Dec 7", total, 3-column line items (18px / minmax(0,1fr) / auto, gap 3px 10px, 3-line clamp, tap for the full text, price nowrap), Total row, Copy link / Share tiles (h64, r16, design hexes), copied state with the gold check pop and ring, the URL under the buttons only after Copy, Preview | Revise footer, "Shared. I'll ping you as soon as <name> opens it."
DIFF: the flip's exit half (label out, 140ms) is missing: the new label comes in, the old one just goes. The photo grid is the app's AttachmentsEditor, not the design's placeholder 3-column grid with the "+3" overlay: UNVERIFIED. Revise opens the estimate screen rather than editing in the thread.

## 06 Edit in place: EstimateDetail.tsx
MATCH: version badge (v1 cream, v2+ ink, shows the version the edits will become), chip tints, number and validity, 28px title with pencil, dashed rule, 34px total with the old total struck through, Copy link / Share tiles h54, "Same link, updated." note, "Editing v2 · v1 sent Nov 7", Previous version (read-only, "Viewing vN" + Back), save bar (220ms; "N changes", "Total $A → $B", Discard, Save changes), "Updated" chip with the badge pulse, "Saved as v2. Same link. Want me to let <name> know?" with Tell <name> (reuses Share) and Not now, Revise slides in 320ms, signed estimates stay locked.
DIFF: inline editing of a line item is the app's LineItemsEditor, not the design's gold-ringed quantity field and unit chip: not rebuilt. The save bar is sticky inside the page, not fixed above the tab bar. The line-items card uses the design's container and header but the app's rows.
NOT BUILT: 6.3 warning sheet, "Needs re-sign" chip, 6.6.

## 04 PDF and send states: PdfSendCard
MATCH: Building PDF (shimmer 240px / 1.4s, spinner 800ms) with Send live and the "You can send now…" line; Ready (file tile pop 300ms, size, Preview); Error (rust row, Retry, "Send link only"); Sending; Sent (check, "Sent to <name>", Resend). Estimates never wait on a PDF.
DIFF: "Text + email · 9:42 AM" reads only the time: the app does not know which channel the share sheet used. The page count counts PDF page objects and can be absent for compressed files; the line then shows size only. A send tapped during the build runs when the file lands; on iOS the share sheet may need the tap's user activation, so a second tap can be needed: UNVERIFIED on a phone.

## 07 Recap cards: RecapChatCard, lib/chat-recap
MATCH: daily (2x2 tiles, Open Books) and weekly (seven bars with the peak in gold, Owed / Overdue / Signed). Built on app open (daily after 7:00 local, weekly on Monday), once per period per device; an empty period posts nothing; "How did today go?" and "How'd I do this week?" answer from the owner's rows.
DIFF: "Good morning." without a name. "Best week since <month>" appears only when an earlier week in the last 14 proves it. "Once per period" is remembered in localStorage, so a second device posts its own card. Notification settings for recap times are out of scope.

## 06.5 Client page "Updated" tag: EstimateView
MATCH: red chip (#FBE4E1 / #B8202A, refresh icon, "Updated Nov 8"), notice box (#FFF6F4, #F1CFCA), "Total changed from X to Y (line: 1 hr → 2 hr)".
DIFF: the business name stands in for "Cyril". 6.6 "Signed again": NOT BUILT.

## Added beyond the prompt (data the copy needed, all additive)
- `meta.total` and `meta.balance` on server payment events; amount and due date on invoice views; `nth_today` on estimate views.
- `updatedAt` and `change` on the public estimate (read from existing version snapshots).
- A shared convert helper (same insert and idempotency key as the estimate screen) so the card and toast can convert in place.
No migrations were written or applied.
