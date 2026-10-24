# Public estimate page — how to reach the 15 states

Companion to `supabase/seeds/estimates_public_page_states.sql` (test DB only, ref
`aiijzulctfpzdfjqyggm`). Design frames are the ones named in
`ESTIMATES-DESIGN-SPEC.md` §7.

There is no owner estimate UI yet, so every state is reached by creating the
estimate through chat and shaping it with that SQL file. Nothing here needs a
migration.

## URLs

| What | URL |
|---|---|
| Client page | `https://<git-preview>/e/<public_token>` |
| Owner preview | `https://<git-preview>/e/<public_token>?preview=1` (signed in, own row) |
| OAuth-less share | the token is `invoices.public_token`; the SQL spot-check prints it |

The Git-built preview of the branch is the only test target — its branch-scoped
env points at the test DB. A `vercel` CLI deploy of this branch would point at
production.

## The five test estimates

Create them in chat with these exact client names (step 1 of the SQL):

`ZZ TEST public page pending` · `approved` · `expired` · `revoked` · `many items`

`ZZ TEST public page pending` is the workhorse: it carries the title, address,
long notes, tax rate, and the attachments.

## Frames

| # | Frame | How to reach it | Expect |
|---|---|---|---|
| 01 | Pending default | `/e/<token>` for **pending** (SQL step 2 sent it) | Pending chip, `Valid until …`, total, items, notes, `Review & sign` |
| 01b | Sticky bar after hero | load 01, scroll the hero card off the top | Bar slides up with `ESTIMATE TOTAL`, total and `Review & sign`; hides while a sheet or the viewer is open |
| 02 | Items expanded (24) | **many items** (SQL step 5) then `View all 24 items`, tap a row | All 24 rows, the tapped row's description unclamps, `Show fewer items` |
| 03a | Sign sheet, draw empty | 01 → `Review & sign` | Bottom sheet, Draw tab, empty pad with the placeholder, `Clear` disabled, `Still needed: signature, full name, checkbox` |
| 03b | Draw signed, valid | draw in the pad, type the name, tick the box | Button enables, the missing line disappears, no error |
| 04 | Type tab | 03a → `Type`, type a name | 120px box previews the name in Allura; `Clear` empties the name |
| 05a | Submitting | DevTools → Network → Slow 3G, then `Approve estimate` | Spinner + `Approving…`, inputs disabled, sheet will not close |
| 05b | Success | sign 01 normally | Green check, `Estimate approved.`, summary with signature, save-link box, `Copy link` (shows `Copied`) |
| 06 | Approved revisit | reload `/e/<token>` after 05b, or the **approved** row (SQL step 7) | Approved chip, `Signed & approved`, signature box, `Signed by / Date / Method` |
| 07 | Expired read-only | **expired** (SQL step 3) | Expired chip, `This estimate expired …`, Call/Text when the profile has a phone, no signing |
| 08 | Canceled / unavailable | **revoked** (SQL step 3), a deleted row, or any made-up token | `link_off`, `This link isn't active anymore`; never says which reason |
| 09 | No logo, no brand color | SQL step 8 (record the restore statement first) | Initials tile in gold, gold accents, no logo; restore afterwards |
| 10 | Owner preview | `/e/<token>?preview=1` while signed in as the owner | Dark `Preview, this is what your client sees` banner, `Signing is turned off in preview.`, buttons disabled |
| 11 | Attachments, photos + docs | **pending** + SQL step 6 (upload 4 photos + 1 PDF first) | 2-column 4:3 photo grid with captions, PDF rows with `View`, first four then `View all N attachments` |
| 12 | Full-screen viewer | 11 → tap a photo | Dark stage, `1 of 4`, chevrons hidden at the ends, 40px swipe, caption, page scroll locked |
| 13 | 10 attachments expanded | upload 10 objects, run SQL step 6, tap `View all` | All 10 tiles/rows; limit is enforced server-side at 10 |
| 14 | Attachment failed + retry | the `missing-object.jpg` row from SQL step 6 | `Couldn't load photo` + `Retry` (headline `Retrying…` while it runs); signing still works |
| 15 | Zero attachments | **approved** or **expired** (no attachment rows) | The whole attachments card is absent |

## Notes

- Signature image: a drawn signature is stored as a PNG data URL and rendered
  as-is; a typed one renders the name in Allura.
- `content_changed`: open the sign sheet on 01, then in SQL change that
  estimate's `total` (or add an attachment) and submit. The sheet closes, the
  page refetches and the notice `This estimate was updated…` appears. Reopen the
  sheet to see a fresh, empty form.
- 409/410 while signing: approve the estimate in another tab first, then submit
  the stale sheet — the page reloads into Approved.
- Cleanup: SQL step 10 soft-deletes every `ZZ TEST public page%` row, removes its
  attachment rows, and the storage folders are deleted in the dashboard.
