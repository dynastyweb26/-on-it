# PAY-PAGE-V2-SPEC.md

Branch: `feat/pay-page-v2` (off main). One commit per numbered item. Test on a Vercel preview on a real phone, never localhost. No emojis. Material Symbols Outlined only. Use the app's existing fonts, colors and tokens.

The reference is the Claude Design file `Pay Page2 redesign.html` (frames 2a-2r). It is a visual reference only. Take layout, spacing and states from it. Do NOT copy its code, its DM Sans font, its inline SVG icons, or its inner-scroll-container approach.

The design reference file is deliberately NOT committed: the repo is public and the mockup contains real payment handles. The owner will attach it in the session. Never copy real handles, phone numbers or bank values from the mockup into code or tests.

## Step 0: Audit (read-only, report back before any edit)

1. Read the current `/pay/[token]` route and components. List what exists for: payment rows, bank transfer section, deposit handling, tax, logo, sticky behavior.
2. Find where deposit, tax and the deposit-paid timestamp are stored. Report the exact field names. If no deposit-paid date is stored, say so.
3. Find the function that computes subtotal / tax / total / deposit / balance for the PDF, and the one the pay page uses. Report whether they are the same function. They must be one shared function (see item 4).
4. Find how the Stripe Checkout session amount is set (deposit vs balance vs total). Report whether the amount comes from the server or from the client.
5. Report the logo rendering (size, object-fit) and how a missing logo falls back.
6. List anything in the current page that the design drops or contradicts. Do not fix anything yet.

Stop and report. Wait for approval before step 1.

## Items (one commit each)

1. **Logo tile.** 96px tall tile, white surface, 12px padding, 26px radius, soft shadow, `object-fit: contain` so nothing is cropped. Wide logos (aspect ratio above roughly 2:1) get a wider tile, up to about 200px wide, so they stay readable. Initials fallback: 96px tile filled with the brand color (default gold). Brand color is used only for this initials tile. Test with square, wide and tall logos.
2. **Buttons.** Copy and Open use one outlined cream pill (neutral border, dark text, icon, 44px min height). The sticky bar's "How to pay" uses the same style. Remove every gold-filled button. Keep the gold ring on the Card row. Keep the green "Copied" state.
3. **Tax.** Show Subtotal and Tax rows only when the invoice has tax. Label with the invoice's own rate and name, for example "Sales tax (6.5%)". With no tax, show only the total line. No hardcoded rate anywhere.
4. **Single source of money math.** One shared function used by the pay page, the PDF and the Stripe session. Inputs: items, tax rate, deposit, payments received. Outputs: subtotal, tax, total, deposit, balance, amount due now. All rounding in integer cents. Add tests for odd rates (for example 8.875%) and confirm the page and the PDF show identical totals.
5. **Deposit states.**
   - Deposit due: hero label "Deposit due now", big number is the deposit, "Total $X" beneath.
   - Deposit paid, balance remaining: hero label "Balance due", big number is the balance, "Total $X" beneath, and a green pill "Deposit of $Y received" with the stored received date (use the field found in step 0). If the date is missing, omit it.
   - Overdue deposit: the existing overdue pill, worded "Deposit was due {date}".
   - Paid in full: the existing green state.
   - Summary block: Total, then either "Deposit due now" and "Balance after deposit", or "Deposit received {date} -$Y" and "Balance due".
   - The sticky bar amount and its subline follow the same state.
6. **Stripe amount.** The Checkout session amount is computed server-side from the stored invoice using the shared function: deposit when a deposit is due, balance after a deposit is paid, total otherwise. The client never sends an amount. Cash App, PayPal and Venmo Open links use the same amount.
7. **Bank transfer section.**
   - Add a Copy button to the account number. It copies the full number even while the display is masked.
   - Keep the masked display with the Show / Hide reveal.
   - Show the invoice number once (the memo row with Copy). Remove the duplicate sentence.
   - Keep the "usually 1-3 business days" note.
8. **Row text.** Shorten the Card row subtitle to "Card or wallet". Long handles (PayPal) wrap to a second line instead of truncating to "paypal.me/D...".
9. **Copy reliability.** Show "Copied" only when the clipboard write succeeds. If it fails, select the text so the customer can copy it by hand, and show no false confirmation. Test in an in-app browser (open the link from Messages or Gmail).
10. **Sticky bar.** Use normal page scroll, not an inner scroll container. Show the bar with an IntersectionObserver on the hero. Add `env(safe-area-inset-top)` padding. The "How to pay" button scrolls to the payment section.
11. **Line items.** Collapsed list shows 3 lines, each clamped to 2 lines. Expanded list shows full descriptions. Keep "View all N items" and "Show fewer".

## Out of scope

Customer name block, notes or terms, an "I've paid" action, changes to the payment-method set or order, new payment methods.

## Verification (on the preview deploy, phone)

1. Statuses: due, overdue, paid, deposit due, deposit paid, deposit overdue.
2. With and without tax, including an odd rate.
3. Logos: square, wide, tall, none.
4. Every Copy button, every Open link (amount matches the state), bank reveal and account-number Copy.
5. Stripe checkout opens with the right amount for each status.
6. The sticky bar on a long list.
7. Page total and PDF total match on the same invoice.
