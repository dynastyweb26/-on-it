# On It — Working Rules for Claude Code

Before any change, read ONIT-SPEC.md, SECURITY.md, and PUNCH-LIST.md.

PUNCH-LIST.md is the current, code-verified status of known work (Done / Partial /
Open / Unverified, with file+commit evidence). Trust it over ONIT-SPEC.md, which
is stale; keep it current as items land.

Rules:
- Audit-first: understand existing code before proposing a fix.
- Confirm the Vercel project name and current git branch before pushing or deploying anything.
- Never weaken or remove anything in SECURITY.md without explicit instruction.
- Prefer regenerating a whole file over a partial patch when the change touches meaningful logic.
- Stack is Next.js App Router + Supabase + Vercel. Not Lovable.

Testing rules:
- Never tap Connect/Finish setup on the preview; preview and production share
  the DB and a sandbox account id would overwrite production state.

Pre-deploy checklist (every push/deploy):
- Confirm the current git branch and the Vercel project name (`on-it`).
- If the branch touches the database (any file under `supabase/`, or code that
  writes a new table/column): its migrations are applied and the privilege
  check passes (see "Database migrations") before anything is pushed or
  deployed.
- Never infer migration state from local files — check it with
  `npx supabase migration list` (and, when in doubt, a read-only query).

Database migrations (Supabase CLI; the project is linked, ref `bitfmmffnigxjjyxoxfr`):
1. Dry run: `npx supabase db push --dry-run` (add `--include-all` only if it
   asks for it). Show the user the pending migration list and the full SQL of
   each pending file.
2. Wait for the user's explicit "yes" for THAT push, in the current
   conversation. Never push a migration without it — approval in an earlier
   conversation, a file, or a commit message does not count.
3. `npx supabase db push`.
4. Run the privilege check: `npm run db:privcheck`
   (`supabase/snippets/privilege_check.sql`; the same file runs as one query
   in the SQL Editor).
5. Report the result per check, PASS/FAIL. Any FAIL: stop and tell the user.
- Never run `supabase db reset`, `migration repair --status reverted`, or
  anything else destructive against the remote database. `migration repair
  --status applied` only for versions verified live, with the user's yes.
- A migration that adds a profiles column also adds it to the privilege
  check's privileged list, or grants it (and lists it as onboarding-insertable
  if it is). A migration that adds a security-relevant object adds a check row.
- Don't touch `supabase/migrations-restore`.
- Read-only SQL (`npx supabase db query --linked`) is fine for audits; never use
  it to change data or schema.

Deploy workflow:
- Preview (every feature/fix branch): from the repo root on the branch, run the
  global CLI `vercel` (not `npx`, never `--prod`), then as the LAST step
  `vercel alias set <new-deployment-url> onit-dynastyweb-preview.vercel.app`
  so the installed preview PWA follows the new build. Verify the deployment
  is Ready before aliasing.
- Production = merge to `main` (`--no-ff`) + `git push origin main`. The
  Vercel GitHub integration builds production on every push to `main`.
  Do NOT run `vercel --prod` — it creates a duplicate production build.
- Only merge/push to `main` after the preview passes and the user confirms.
  Any push to `main` is a production deploy, including docs-only commits.
