# On It — Working Rules for Claude Code

Before any change, read ONIT-SPEC.md and SECURITY.md.

Rules:
- Audit-first: understand existing code before proposing a fix.
- Confirm the Vercel project name and current git branch before pushing or deploying anything.
- Never weaken or remove anything in SECURITY.md without explicit instruction.
- Prefer regenerating a whole file over a partial patch when the change touches meaningful logic.
- Stack is Next.js App Router + Supabase + Vercel. Not Lovable.
