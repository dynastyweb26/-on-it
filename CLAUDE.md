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

Pre-deploy checklist (every push/deploy):
- Confirm the current git branch and the Vercel project name (`on-it`).
- If the branch touches the database (any file under `supabase/`, or code that
  writes a new table/column): the user applies migrations in the SQL Editor and
  confirms they ran, THEN runs `supabase/snippets/privilege_check.sql` and
  confirms every expected result before anything is pushed or deployed. A
  migration that adds a profiles column also adds it to that snippet's
  privileged or safe list.
- Never infer migration state from local files — ask the user to verify with SQL.
