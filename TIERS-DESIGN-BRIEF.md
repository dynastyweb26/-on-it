# Tiers phase 3: Claude Design brief

Paste this whole file into Claude Design with the references listed at the end.
What Claude Design makes here is the source of truth: the app gets built to match it.

## What On It is selling

| | Free | Pro ($9.99/mo) | Plus ($16.99/mo) |
|---|---|---|---|
| Invoices | 3 | unlimited | unlimited |
| Estimates | 3 | unlimited | unlimited |
| Expenses | 5 | unlimited | unlimited |
| Recaps | 2 weekly | all | all |
| Income / expense PDFs | no | yes | yes |
| AI questions per day | 5 | 30 | 100 |
| Bank activity | no | no | yes |
| Recurring expenses | no | no | yes |
| Attachments (photos on invoices and estimates) | no | no | yes |

- 14-day free trial on either plan. Founder code = Plus.
- Bought in the App Store / Google Play (native app). Every screen that sells needs a
  Restore Purchases link.
- Display names "Pro" and "Plus" are placeholders. Design with them; the founder can
  rename later.

## Rules every screen follows

1. No surprises. A limit is visible before it's hit ("2 of 5 left today"). A lock
   names the plan that opens it and its price. A refusal says when it resets.
2. Nothing the user already has is taken away. A downgraded user keeps their existing
   photos, recurring expenses and connected bank; only adding new ones is locked.
3. The AI limit never blocks the core job. At the limit, creating invoices, estimates
   and expenses with the + menu still works, and the card says so.
4. After a purchase the screen waits for the server to confirm the plan. It never
   shows Plus features until then.
5. House style: Warm Premium (design/tokens.css, ON-IT-DESIGN-STANDARD.md). Cream
   #fff8f0, gold #d4af37 as fill only, text-safe gold #735c00, Montserrat 700/800
   headings, Inter body, Material Symbols Outlined only, no emojis, tap targets 56px+,
   numbers are the hero. On screen the word is "estimate", never "quote".
6. Every new component lists its states: idle, pending, error, repeat-tap (the second
   tap does nothing visible beyond the pending state). Plus "success" where a purchase
   or plan change is involved.
7. Phone (390px) first, then laptop (1280px+) for each screen.
8. Popups and cards enter with motion, reusing the app's existing animations (see
   design/popups and design/alive-layer). Nothing just appears.

## Screens

### 1. Paywall, plan page (replaces page 3 of today's 3-page paywall)

Today's page 3 has one plan and a FREE / ON IT table. It becomes a two-plan picker.

- Plan picker: Pro and Plus as two selectable cards (price, one-line pitch, "14-day
  free trial"). Selected = gold ring (app-wide selected style).
- Comparison table: FREE / PRO / PLUS columns, rows from the table above. The selected
  plan's column is highlighted.
- One CTA: "Start 14-day free trial" for the selected plan. Under it: "then $X / month,
  cancel anytime" and the store renewal line.
- Keep from today: founder/invite code row, Cyril's testimonial, trial reminder row,
  legal footer (reachable by scrolling on laptop).
- Restore Purchases link.
- Which plan opens preselected:
  - Opened from a free limit (4th invoice etc.): Pro preselected.
  - Opened from a Plus lock (bank, recurring, photos): Plus preselected.
- Variant: user already on Pro opening it from a Plus lock. No trial; CTA "Upgrade to
  Plus", line "You pay only the difference for the days left this month. Plus opens
  right away."
- States: idle; pending (store sheet open: CTA shows a spinner, picker frozen);
  confirming ("Confirming your purchase..." after the store says yes, waiting on the
  server, with a retry after 20s); success (hands off to the existing celebration
  animation); error (store failed or user cancelled: cancelled = back to idle with no
  message, failed = inline message naming the cause); repeat-tap.

### 2. AI meter (chat)

- A quiet line near the chat input: "2 of 5 left today". Decide placement so it
  doesn't crowd the input bar (the input bar itself must not change).
- Shown only when the user has 3 or fewer questions left today. Hidden otherwise.
- At 0 the meter turns into the limit card (screen 3).
- Plus users at 100/day: same meter, same threshold.

### 3. AI limit card (chat)

A chat card, built as a template in the design/ai-templates family.

- Headline + "You've used all 5 questions for today."
- When it resets: "Back at midnight" (the owner's local midnight).
- Reassurance row: "You can still create invoices, estimates and expenses with +".
- Upgrade row, depends on plan:
  - Free: "Pro gives you 30 a day" + button to the paywall (Pro preselected).
  - Pro: "Plus gives you 100 a day" + upgrade button.
  - Plus: no upgrade row, just the reset time.
- States: idle; pending (button tapped, paywall opening); repeat-tap.

### 4. Lock sheets (three of them, one shared layout)

A bottom sheet (centered dialog on laptop) shown when a non-Plus user taps:

- Connect a bank (Books / bank activity).
- Add a recurring expense (the "new" button only; existing items keep working).
- Add a photo to an invoice or estimate.

Each sheet: icon for the feature, headline naming it, 2-3 lines on what it does,
"Included in Plus · $16.99/mo", primary button, "Not now".

- Free user: button opens the paywall with Plus preselected.
- Pro user: button is "Upgrade to Plus" (pay-the-difference line, as screen 1 variant).
- States: idle, pending, error, repeat-tap.

### 5. Photos skipped notice

When a non-Plus user revises an invoice/estimate (or converts an estimate to an
invoice) that has photos, the new copy is made without them. The original keeps them.

- A light toast or inline note on the new document: "Photos weren't copied. Adding
  photos is part of Plus." with an upgrade link.
- Uses the existing light cream toast style.

### 6. Settings > Plan

- Current plan card: plan name, price, renewal date ("Renews Dec 15"). Trial:
  "Free trial · ends Nov 29".
- Usage: AI questions today (bar, "12 of 30"). Free users also see invoices,
  estimates and expenses used of their cap.
- Actions:
  - Free: "See plans" (paywall).
  - Pro: "Upgrade to Plus".
  - Plus: "Switch to Pro" (takes effect at the end of the paid period).
  - Pending downgrade: "Plus until Dec 15, then Pro" with "Keep Plus" (undo).
  - Founder: "Founder · Plus, free forever", no actions.
- Manage subscription (opens the store's subscription page) and Restore Purchases.
- States: idle; loading (skeleton); pending (any action); error; repeat-tap.

### 7. Cancel flow, two-plan additions

The live cancel flow (CANCEL-FLOW-SPEC.md) stays. One new state:

- Plus user picks "Too expensive": choose one of "Switch to Pro ($9.99)" or "50% off
  your next 2 months". Switching counts as the offer taken.
- iOS has no pause: where "Slow season" would offer a pause, iOS offers the Pro switch.

## References to attach

- design/tokens.css and ON-IT-DESIGN-STANDARD.md
- Today's paywall: screenshots of all 3 pages (phone + laptop)
- design/ai-templates/ (for the limit card) and design/ai-templates/RULES.md
- design/popups/ and design/alive-layer/ (toasts, sheets, motion)
- Screenshots: chat with the input bar, Books, Recurring, an invoice with photos,
  Settings > Plan as it is today, the cancel flow

## Out of scope

- Anything about the $30 tier or voice (both vaulted).
- Web Stripe checkout changes (Stripe keeps selling the $9.99 plan until the native
  launch).
- Recaps (separate round, already done).
