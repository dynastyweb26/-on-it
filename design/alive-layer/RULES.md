# Alive Layer — standing rules

Binding for every phase. Re-read at the start of each phase. Do not paraphrase away.

- Scope: build only the numbered items. Never add things that merely exist in the design HTML. Report BUILT / NOT BUILT / ADDED BEYOND THIS PROMPT every phase (the last should be empty).
- Never edit any header, top bar or tab bar. Toasts are overlays above the header. Cream toast only (Direction A), no black toast. Paid-in-full: Direction A only.
- No recaps, haptics, push, Notifications settings, dark mode. Gold in-app, red on /e and /pay. Respect reduced motion.
- Events table = ONLY outside-the-owner's-session things (client actions, server-path payments, time-based). Server-side writes only. Event cards render from the events table into the thread; never written into StoredChat. Owner outcomes (sent, payment recorded by owner, share done, action receipts, expense logged, new client, client lookup, "INV ready") are local assistant cards in StoredChat, not events, no toasts.
- New top-drop toast component; do not modify PopToast/UndoToast.
- Phase 4 split: 4A edit-in-place (version column + estimate_versions only; no status change; no signature change; signed estimates blocked with "This estimate is signed and locked."). 4B (re-sign) not started until I say; "needs re-sign" is derived, never a status.
- Reminders reuse existing actions (Request balance re-share for invoices, Share for estimates). No new owner reminder action, no reactivate route, deactivate has no Undo, extend Undo only if the existing route allows it.
- Item 3 estimates never wait on a PDF. Item 22 (send queue) NOT BUILT. Omit Send receipt, Mark job done, Tell Maryam.
- Icons: Material Symbols via the subset font, no Tabler. Tokens: extend design/tokens.css, the app's creams win.
- Migrations: never apply them. Write files, show SQL, I review and apply.
- Pay-page 20-minute case uses document_views (item 23).
- Invoice Revise is untouched. Status chips derive from existing fields in 4A.
