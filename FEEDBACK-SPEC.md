# Tell us about On It — feedback feature spec

Status: draft for founder sign-off (2026-10-17). Branch: `feat/feedback`.
Founder decisions (2026-10-17): read submissions BOTH in a table and by email; the founder
replies personally; Chat asks users now and then if they want to say something.
Community / comments / voting are OUT of scope (wait for more users).

## 0. Audit (done)

- Today "feedback" is one `mailto:` row, "Contact us", on Help & feedback
  (`settings/SettingsView.tsx`). Nothing is stored; no way to see patterns.
- Cancel flow already stores a reason in `cancel_events` (separate; leave it alone).
- Patterns to copy: `cancel_events` migration (service-role writes, RLS read-own,
  table-level revoke), `rateLimit(route, id)` in `lib/ratelimit.ts` (add a
  `feedback` route), Resend via `lib/email/resend.ts`, Zod on routes,
  privilege-check rows (`supabase/snippets/privilege_check.sql`), no emojis,
  Material Symbols only, copy tone from the trial email (plain, no guilt).
- Account deletion: `user_id ... on delete cascade` removes feedback with the account.

## 1. What the user sees

1. Help & feedback gets a top row "Tell us about On It" (icon `rate_review`),
   above "Contact us" (which stays).
2. Screen `/settings/help/feedback` (new section in `settings/sections.ts`):
   - Prompt: "What's working, what's annoying, what do you wish it did?"
   - Tag, pick one (required): Idea · Problem · Love it
   - Message, 5 to 2000 characters (required)
   - Stars 1 to 5 (optional)
   - Send. Sending state, then "Thanks. I read every one and I'll reply by email if
     there's something to say." Failure keeps the text and offers Retry.
3. Reached the same way from Chat (section 3) with the screen name attached.

## 2. Data

Migration (additive, idempotent; may go out from the branch before merge, with the
full dry-run / SQL / yes / privilege-check flow):

`public.feedback`
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null references auth.users on delete cascade`
- `tag text not null` check in (`idea`,`problem`,`love`)
- `message text not null` check char_length between 5 and 2000
- `rating smallint` check null or between 1 and 5
- `source text not null default 'settings'` check in (`settings`,`chat_prompt`)
- `screen text` (route the user was on, max 60 chars), `app_version text`
- `status text not null default 'new'` check in (`new`,`replied`,`planned`,`shipped`,`closed`)
- `created_at timestamptz not null default now()`

RLS on; revoke all from anon/authenticated; grant SELECT to authenticated with a
read-own policy. Writes: service role only (the API route). Add check rows to the
privilege check (RLS on, no client INSERT/UPDATE/DELETE).

## 3. API and email

`POST /api/feedback` (session client for auth, service role for the insert):
Zod body `{ tag, message, rating?, source, screen? }`; 401 if signed out;
`rateLimit('feedback', ...)` = 5 per hour per user; trim, strip control chars,
reject empty. Insert, then send the owner email; an email failure is logged and
never fails the submission (row is already saved).

Owner email (Resend, existing sender): to `brandon@dynastyweb.co`, subject
`On It feedback · {tag} · {business or "new user"}`, body = message, stars, screen,
app version; `Reply-To` = the user's account email, so replying from Zoho goes
straight to them. This is the "reply from me" path: no in-app inbox in v1.
Status is changed by hand in the Supabase table.

## 4. Chat asks "now and then"

A soft card in Chat: "Got a minute? Tell us what's working or what isn't."
Buttons: "Tell us" (opens the screen) · "Not now".
Proposed rules (adjust at sign-off):
- Eligible only after a meaningful moment: a quote or invoice sent or finalized,
  and the user has sent at least 3 documents in total.
- At most once every 21 days. "Not now" snoozes 21 days; dismissed twice in a row
  stops it for 60 days. A submitted feedback resets to 30 days.
- Never during a voice session, an open template, the paywall, or the tour.
- State in localStorage (`onit_feedback_prompt`: last shown, dismiss count); no DB.

## 5. Privacy and Apple

- Privacy Policy: one new paragraph (feedback is stored with your account, read by
  the founder, emailed to the founder with your account email as reply address,
  deleted with your account). Same commit as the feature.
- No user-generated content is shown to other users, so Apple Guideline 1.2 does not
  apply. Revisit if comments or a community are added.

## 6. Commits (one each) and tests

1. migration + privilege-check rows (additive; needs the user's yes to `db push`)
2. `/api/feedback` + `lib/feedback.ts` (validation, prompt-eligibility logic) + tests
3. settings screen + Help row
4. Chat prompt card
5. Privacy Policy paragraph + PUNCH-LIST entry

Tests: validation (tag/length/rating bounds, control chars), prompt-eligibility
(thresholds, snooze, double-dismiss, resets). Preview test: send one of each tag,
confirm the row and the email arrive, hit the rate limit, check the prompt appears
once and then snoozes.

## 7. Not doing (deliberately)

Public board, comments, upvotes, in-app replies or inbox, attachments, admin UI.
