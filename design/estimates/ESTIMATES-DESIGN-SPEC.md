# ESTIMATES-DESIGN-SPEC.md

Source: Claude Design export "Sign Estimate Page" (client page, 15 states; owner editor, 7 states).
This file is the single source of truth for Estimates UI. Put it at `design/estimates/ESTIMATES-DESIGN-SPEC.md`.
Read it before touching any estimate UI. Audit the existing code first (CLAUDE.md rule); never invent screens that are not listed here.

## 0. Global rules

- The word is **Estimate** everywhere a person can see or hear it. Never "Quote". Numbers display **E-####** (old Q-#### rows display as E-####, same digits). Internal `kind='quote'` and DB columns stay.
- **No PDFs for estimates, ever.** Remove Share PDF / Download / View PDF / Print for `kind='quote'`. Estimates are delivered as a link to `/e/[token]`.
- An estimate is approved only when `approved_at IS NOT NULL`, written only by `sign_estimate`. The old manual "Mark as signed" / undo UI is retired.
- Stack: Next.js App Router + Supabase + Vercel. Reuse existing helpers (colors.ts onColor, heic conversion in receipt.ts, Icon.tsx, copyAttachments, ratelimit).
- Test only on the Git-built preview of the branch (never the CLI preview, never localhost). Verify the preview's inlined Supabase ref is the test project before asking the founder to test.

## 1. Look and feel (tokens from the design)

- Surfaces: page `#FDF8F0`; card `#FAF3E6` border `#EBDFC6` radius 22; inset card `#FFFDF8`; muted block `#F1E6D2`; dashed rule `#D9C9A8`.
- Text: `#1E1A15`; secondary `#4A4236`; tertiary `#6B6256`.
- Gold accent (default/fallback): `#D3AE37`, text on gold `#1E1A15`. Success chip `#DDF1E3` / `#1E6B3A`. Pending chip `#F3E7C9` / `#6B5410`. Expired chip `#F4E2D8` / `#8A3B1E`. Error `#9B3A23`, error bg `#FBE9E3`, border `#C2492E`.
- Public page fonts: Montserrat 700/800 (headings, totals), DM Sans 400/500/600/700 (body), **Allura** (typed signature only), Material Symbols **Rounded** icons. Load with next/font on the `/e/[token]` route only.
- Owner screen: use the app's own tokens, fonts and Icon component. Take layout, copy, states and behavior from the design, not the typography. (Founder can overrule.)
- Touch targets 44px minimum. Numbers use tabular-nums. Money is `$1,234.56`.
- Brand color on the public page: accent = the business brand color if set, else gold. `accentText` = accent darkened (x0.9 steps, max 30) until contrast vs `#FDF8F0` >= 4.6. `onAccent` = white if contrast vs accent >= 4.5 else `#1E1A15`. No logo: show an initials tile (first letters of the business name) in the accent color. Use `src/lib/colors.ts`; do not add a second contrast function.

## 2. Public client page `/e/[token]` (no login)

Mobile column: `max-width 440`, centered, padding 20. On desktop the same column is centered on the page background (design frame 1180 wide shows one centered column, not a two-pane layout).

### 2.1 Layout, top to bottom (status pending unless noted)

1. **Preview banner** (owner preview only): sticky top, dark `#1E1A15`, eye icon, text `Preview, this is what your client sees`.
2. **Header** (centered): logo tile 96x96 radius 26 white, or initials tile in accent. Business name (Montserrat 800, 26). Contact row: `{phone} · {email}` as tel:/mailto: links (44px tall). Hide the row if both are empty; show only the ones present. Below: `Estimate E-0017`.
3. **Hero card**: left a status chip (Pending `schedule` icon / Approved `verified` / Expired `event_busy`), right the validity text: `Valid until Nov 18` / `Approved Oct 22` / `Expired Nov 18`. Then `Prepared for **{client}**` and, on the next line, `{title} · {address}` (title = estimate title; address = client_address; omit missing parts and the dot). Dashed rule. Centered: `ESTIMATE TOTAL` (13px caps), total (Montserrat 800, 44), `{N items|1 item} · includes {tax} tax`.
4. **Line items card**: header `LINE ITEMS` + `{N} items`. Show the first 3 rows; if more than 3, a full-width button `View all {N} items` (chevron) toggling to `Show fewer items`. Each row is a button: name + amount, a 2-line-clamped description (tap to expand that row, aria-expanded), and `{qty} {unit} × {unit price}` line. Footer block `#F3E9D5`: `Subtotal`, `Tax (8.25%)` (use the real rate), divider, `Total`.
5. **Attachments card** (hidden entirely when there are none): header `ATTACHMENTS ({N})`.
   - Photos: 2-column grid, 4:3, radius 14, caption under each (single line, ellipsis). Tap opens the viewer.
   - Documents: rows (min height 64): type badge (`PDF`, color `#9B3A23`), file name (ellipsis), `{size} · PDF`, caption, and a `View` link with open_in_new icon (opens in a new tab).
   - Show the first 4 attachments; if more than 4 a button `View all {N} attachments` / `Show fewer`.
   - A failed photo shows `Couldn't load photo` + `Retry` button; a failed document shows meta `Couldn't load file` in error color + `Retry`. While retrying the label is `Retrying…`. Signing stays available when attachments fail.
6. **Notes & terms card**: `NOTES & TERMS`, text with preserved line breaks, clamped to 4 lines, button `Read more` / `Show less`. (Hide the card when notes are empty.)
7. **Signature card** (depends on status, see 2.2).
8. **Footer**: `Sent with On It`, then `Privacy · Terms` links.
9. **Sticky bar** (pending only, on screen from the first paint — not gated on scroll; hidden while a sheet or the viewer is open): `ESTIMATE TOTAL` + total on the left, `Review & sign` button on the right. Slides up/down, respects the iOS safe-area inset, and the page reserves bottom padding for it so it never covers the last content.

### 2.2 Signature card by status

- **Pending**: `Ready to go ahead?` / `Sign to approve this estimate. {business} is notified right away.` / button `Review & sign` (draw icon, full width, accent) / note `No account needed. Takes about a minute.` In owner preview the button is disabled and the note reads `Signing is turned off in preview.`
- **Approved**: green `verified` + `Signed & approved`. Signature box (white, 124px, baseline rule): drawn = the stored PNG; typed = the name in Allura 52px. Rows: `Signed by`, `Date` (e.g. `Oct 22, 2026 at 10:42 PM`), `Method` = `E-signed on this page`.
- **Expired** (`valid_until` day has ended in the business timezone): `This estimate expired Nov 18.` / `Contact {business} if you'd still like to go ahead. They can send you an updated estimate.` and two buttons: `Call` (accent, tel:) and `Text` (outline, sms:). Hide the buttons if there is no phone. No signing.
- **Canceled / unavailable** (revoked, unknown token, deleted, converted, draft): full-page centered, `link_off` icon in a 72px tile, `This link isn't active anymore`, `The estimate may have been updated or withdrawn. Reach out to the business that sent it and they can send you a fresh link.`, then the footer. Do not reveal which of those reasons applies.

### 2.3 Sign sheet (bottom sheet, max 480 wide, radius 22 top, grab handle, scrim closes it unless submitting)

- Title `Sign estimate`, subtitle `E-0017 · $total`, close button (44px).
- Tabs `Draw` (gesture icon) / `Type` (keyboard icon).
- **Draw**: 168px pad, baseline rule with a small `×`, placeholder `Sign here with your finger` while empty. Pointer events (touch-action none), 2x canvas for sharpness, stroke `#1E1A15` width 2.6 round. Export as PNG data URL.
- **Type**: 120px preview box showing the typed name in Allura 52px, or `Type your name below to sign` while empty.
- Hint line: draw = `Draw your signature in the box`, type = `Your typed name is your signature`. `Clear` button with restart_alt icon (disabled when nothing to clear; type tab clears the name).
- Field `Full legal name`, placeholder `e.g. Jordan Ellis`, autocomplete name.
- If the estimate has attachments: `Includes {N} attachments` with attach_file icon.
- Checkbox (26px box, accent when checked): `I agree to this estimate and to sign electronically`, helper under it `By approving, you agree to sign this estimate electronically.`
- Button `Approve estimate` (full width, accent). Disabled until: draw has ink (or type tab), name trimmed >= 2 chars, checkbox checked. While disabled show `Still needed: signature, full name, checkbox` listing only what is missing. While submitting: spinner + `Approving…`, all inputs disabled, sheet cannot be closed.
- **What to send**: signer name, `draw`|`type`, signature data (PNG data URL <= 200 KB; typed = the name), `consent_text` = the exact checkbox label plus helper sentence shown on screen, `consent_version` `1`, the content hash from the payload the signer is looking at.
- **Undesigned error states (minimal, inline under the button, error color):** 409/410 or unavailable/revoked/expired -> reload into the matching page state; `content_changed` -> refetch the payload, show a toast-style notice `This estimate was updated. Please review the changes and sign again.` and reset the sheet; `invalid_signature` -> `That signature couldn't be read. Clear it and try again.`; 429 -> `Too many attempts. Try again in a minute.`; anything else -> `Couldn't approve. Please try again.`

### 2.4 Success sheet (replaces the sign sheet after approval)

Check circle (64px, green), `Estimate approved.`, `{business} has been notified.` Summary card: `Estimate E-0017` + job line + green `Approved` pill, signature box, rows `Signed by`, `Date`, `Total`. Box: bookmark icon + `Save this link. It's your copy of the signed estimate.` with the link text and a `Copy link` button (icon content_copy, then `Copied` with check for ~2s). Primary button `View signed estimate` (closes the sheet, scrolls to the signature card). Closing the sheet = the same action.

### 2.5 Photo viewer (full screen, dark `#14110D`)

Top bar: close (44px), counter `{i} of {N}`. Center: the photo (contain). Previous/next chevrons (hidden at the ends), swipe left/right with a 40px threshold. Caption below, centered. Sticky bar and page scroll are inactive while open.

### 2.6 Data mapping and behavior

- Use the existing `GET /api/public/estimates/[token]` payload (`src/lib/estimates/public-model.ts`) and `POST .../sign`. Audit the exact field names; extend the payload with the M3 fields (section 4).
- Attachments are served as short-lived signed URLs generated server-side; retry re-requests them. Only rows with a checksum and the `{ownerId}/{estimateId}/` path prefix are included (already enforced by deliverable.ts).
- Viewing the page never writes to the database except an optional viewed marker if the existing invoice-viewed pattern is reused (decide in audit; not required).
- Middleware: the matcher must exclude `e/` the same way it excludes `pay/`. Public route needs the same rate-limiting and no-index headers as `/pay`.
- Old `/pay/[token]` links for a `kind='quote'` row must not render a quote any more: show the canceled/unavailable state or redirect to `/e/[token]`.

## 3. Owner screen: estimate detail (inside the app)

Replaces the quote view in `src/app/(app)/invoices/[id]/page.tsx` for `kind='quote'` only. Invoices are untouched. Keep the app shell (back arrow, `On It.` wordmark, `How On It works`, bottom tabs Clients / Invoices / Chat / Books / Settings with Invoices active).

### 3.1 Top card (all states)

Status chip (Draft `edit`, Sent `fiber_manual_record`, Approved `verified`) on the left, `E-0017` mono on the right. H1 = the estimate title (falls back to the client name when empty). Subtitle: `Estimate · {client} · Draft` / `Sent Oct 22` / `Approved Oct 22`. Ticket-notch divider. `Estimate total` + total (Montserrat 800, 40).

### 3.2 Actions per state

- **Draft**: primary `Send estimate` (send icon), secondary `Preview as client` (eye). No Convert.
- **Sent**: 3 tiles: `Copy link` (toast `Link copied`), `Share` (native share sheet with the link), `Request signature` (resend; toast `Signature request resent to {first name}`); then `Preview as client`. No Convert.
- **Approved**: primary `Convert to Invoice` (autorenew icon; toast uses the real new invoice number); tiles `Copy link`, `Share`, `Preview as client`. A **Signed** card appears under the top card: green verified icon, `SIGNED`, signature box (drawn image or typed name), rows `Signer`, `Signed` (`Oct 22, 2026 · 10:42 PM`), `Method` (`Drawn, from estimate link` or `Typed, from estimate link`).
- After sending: toast `Estimate sent to {first name}`.
- Everything that today produces a PDF for an estimate is removed. Wire Send to `POST /api/estimates/[id]/send`, preview to `.../preview`, resend to the same send route. Never call `/api/invoices/[id]/send` for estimates.

### 3.3 Line items card

Header `LINE ITEMS`. Approved: a muted banner with lock icon `Locked after approval. Duplicate to make changes` and a `Duplicate` button (creates a new draft estimate copying the items, notes, title and attachments, then opens it). Each item: card with `{n}.` mono index, name, amount, and a second line `{qty} {unit} × {unit price}`. When editable (draft or sent-unapproved): dashed `Add item` button; tapping an item edits it. **Item editing is not designed**: reuse the app's existing line-item editor pattern and card style; do not invent a new design. Footer rows `Subtotal`, `Tax ({rate}%)`, `Total`.

### 3.4 Attachments card

Header `ATTACHMENTS` with `{n} of 10` on the right.
- Horizontal scroll strip of tiles, each 112 wide: photo tile (84 tall, thumbnail) or document tile (84 tall, type badge `PDF` + file name). Below each: caption input (placeholder `Add caption`, max 60) when editable, plain caption text when approved.
- Remove: round X button at the tile's top-right (44px hit area) when editable.
- Uploading: dim overlay with a circular progress ring and `{pct}%`. Failed: error-tinted tile `Upload failed` with a `Retry` button under it.
- Below the strip, when editable and under the limit: dashed row button `Add attachment` / sub `Photo or PDF · {10-n} left`. At 10: info box `10 of 10 max. Remove one to add another.`
- Helper text when editable: `Your client sees these on the estimate. They can view, not upload.` Approved: lock icon `Read-only after approval`.
- **Add attachment sheet** (bottom sheet, `{10-n} of 10 left`): `Take photo` (Use your camera), `Photo library` (Choose from your photos), `Files` (**`PDF only`**, see deviations), `Cancel`.
- Constraints (already enforced server-side): JPG/PNG/PDF only, 10 files, 10 MB each, 25 MB total. HEIC from iPhones is converted to JPEG in the browser before upload; a HEIC that reaches the server is refused. Compress photos client-side like the existing invoice attachment flow.
- Wire to the existing routes: presign -> upload -> confirm (`add_estimate_attachment`) -> delete. **Never** use `renumberAttachments` (client delete-and-reinsert) on estimates; reorder, if offered, goes through a server route.

### 3.5 Owner actions that the design does not show (add minimally, flag for founder review)

- `Extend validity` (existing `.../extend` route) and `Deactivate link` (existing `.../revoke` route) as two plain text actions under the tiles on Sent estimates, with a confirm dialog on Deactivate. Show the validity date near the chip: `Valid until Nov 18`; on an expired estimate show an `Expired` chip and `Extend validity`.
- Inline title edit: tap the H1 to edit (max 120). Chat can also set it.

## 4. Backend delta (migration M3, additive, test DB first)

The design needs three things the backend does not have:

1. `invoices.title text null` (<= 120). Part of the content hash. Owner-editable until approved or converted (extend `guard_locked_estimate_edits`). Returned in the public payload and shown as the estimate heading.
2. `invoice_attachments.caption text null` (<= 60). Written only through the service-role RPC behind `/api/estimates/[id]/attachments/[attachmentId]/caption`, which enforces the same lock as `add_estimate_attachment` (no client UPDATE grant exists; keep it that way). Part of the content hash (id + checksum + caption). Returned in the public payload.
3. `profiles.business_phone text null` (<= 30) and `profiles.business_email text null` (<= 254). Editable in Settings -> business info, read live by the public payload loader (`src/lib/estimates/public.ts`) (not snapshotted: a changed number should reach the client). Follow the existing profile-column pattern (`20261017100000_profiles_team_size.sql`): grant, privcheck privileged-list entry, onboarding-insertable if needed.

Also required for every object M3 adds: a row in `scripts/privilege-check.mjs` and `supabase/snippets/privilege_check.sql`, a proof in the proof scripts, and `estimate_content_hash` rebuilt from its latest definition (diff first). Apply to the test DB only (ref aiijzulctfpzdfjqyggm) with dry run, full SQL shown, explicit yes. Never touch production.

## 5. Copy and chat (Sessions 1 and 5)

- Replace every visible "Quote/quote/Quotes" with "Estimate/estimate/Estimates": screens, buttons, toasts, empty states, filters, list rows, notification text, emails, onboarding, help text, share text, document titles, metadata, tests. Q- prefix never shown. Grep `src/` for `quote`, `Quote`, `Q-`, `'Q'`; leave identifiers and `kind='quote'` alone.
- Chat/voice: a person typing or saying "quote" means estimate. The parser prompt, intent routing, tool/enum descriptions and the assistant's replies all use "estimate" and accept "quote", "quotes", "bid", "proposal" as synonyms. "Make a quote for Jordan" creates an estimate and the reply says "estimate". Add tests for typed and voice-transcribed phrasing.

## 6. Deviations from the design and open items

- Design shows Word/Excel files (`.docx`, `.xlsx`) in the attachment picker and viewer. We accept JPG/PNG/PDF only (public signing link, no macro risk). Picker copy says `PDF only`. Needs founder OK to change.
- `Convert to Invoice` appears only after approval in the design. Today's app allows converting any quote. Follow the design; flag the behavior change in the PR notes.
- Not designed: item edit form, title edit, Extend/Revoke, sign error messages, Settings fields for business phone/email, estimate list rows. Use existing app patterns and the card style; keep them minimal.
- Job line uses the client address as the site address.

## 7. Acceptance (the design's own frames)

Client page: 01 pending default; 01b sticky bar on load; 02 items expanded (24 items); 03a sign sheet draw empty; 03b draw signed valid; 04 type tab; 05a submitting; 05b success; 06 approved revisit; 07 expired read-only; 08 canceled/unavailable; 09 no logo, no brand color fallback; 10 owner preview; 11 attachments photos+docs; 12 full-screen viewer; 13 10+ attachments expanded; 14 attachment failed to load with inline retry; 15 zero attachments (section hidden).
Owner: E1 draft; E2 add attachment sheet; E3 uploading; E4 upload failed; E5 10 of 10 max; E6 sent; E7 approved/locked.
Done means each frame can be reproduced with real data on the preview, on a 390px screen, with no PDF anywhere and no visible "Quote" anywhere.
