# Batch 4a — Interaction Polish (Spec)

**Repo:** dynastyweb26/-on-it · **Written:** July 6, 2026
**Execute with:** Claude Code or Cursor — this spec is the source of truth; the
executing model should follow it, not improvise around it.
**Standing rules:** ON-IT-DESIGN-STANDARD.md governs all styling. Audit before
changing. One commit per item. `npm run build` passes before every commit.
Confirm branch and Vercel project before any push.

**Sequencing:** Items 1–2 branch off `main` now (`feat/batch-4a`) — they have no
dependency on the paywall scaffold. Item 3 DEPENDS on `hasAccess()` and the
PaywallProvider, which live on `feat/paywall-scaffold` — do NOT build item 3
until that branch has merged (July 17). If executing before the 17th, do items
1–2 only and stop.

**Already done — do not rebuild:** PDF logo-size increase shipped in the paywall
scaffold (Classic/Ledger 128px, Industrial 144px, Friendly 120px). Voice TTS
stopping on tab-switch/close is intended behavior (browser suspension saves
credits) — do not "fix" it, and do not auto-resume speech on tab return.

---

## Item 1 — Expense form rework

**Problem:** The Add Expense sheet asks twice — category chips AND a required
free-text "What was it for?" field — producing the validation error "Add an
amount and what it was for" even when a chip is selected.

**Spec:**
- Chips (Gas, Materials, Tools, Meals, Phone, Insurance, Other) become the
  primary input. Selecting a chip satisfies the description requirement by
  auto-filling the expense description with the category name.
- For all chips except "Other": the text field is hidden by default. In its
  place, a quiet text link "Add a note" (Inter 600, primary #735c00) reveals an
  OPTIONAL text field whose content is appended to the description
  (e.g. "Materials — Home Depot, PVC fittings"). Good records survive audits;
  the note is encouraged, never required.
- Selecting "Other": the text field appears immediately and IS required
  (placeholder: "What was it for?").
- Validation: amount required always; description satisfied by chip selection
  (or chip + note), or by "Other" + filled text. The old combined error message
  is replaced by field-level errors (error token #ba1a1a, text under the field).
- Selected chip uses the standard selected treatment (.chip-selected — 2px
  #d4af37 ring, offset 2px). Chips remain ≥56px touch targets.

**Tax-deductible tooltip:**
- Add a "?" affordance (Material Symbol `help`, 20px, on-surface-variant) next
  to the "Tax deductible" label. Tap opens a small dismissible popover
  (surface-container-low, 12px radius):
  > "Common examples pros deduct: fuel between jobs, materials, tools, part of
  > your phone bill. We track it — your tax preparer decides what qualifies."
- EXACT wording matters: On It keeps recordkeeping framing, never tax advice.
  Do not strengthen the claim ("this is deductible") anywhere in copy.

**Test criteria:** amount + chip alone saves; note appends to description;
"Other" without text blocks with a field-level error; tooltip opens/dismisses;
keyboard doesn't cover the sheet on mobile.

**Commit:** `feat(expenses): chips-primary form, optional notes, deductible tooltip`

---

## Item 2 — Voice mode revert (kill the orb)

**Problem:** The full-screen gold orb replaced the whole UI for what should be
an input method. Reverting to push-to-talk inside the chat.

**Spec:**
- Delete the full-screen orb voice mode (component, route/state, and the
  "Tap the orb to talk" surface). Audit for dead code and remove it.
- The mic button in the chat composer becomes a voice-session toggle:
  - **Idle:** mic button as currently styled (primary-container gold circle).
  - **Tap mic → voice session ON:** an X button (Material Symbol `close`,
    56px touch target) appears immediately beside the mic. The mic shows the
    listening state (.voice-listening pulse; static FILL-1 + "Listening" label
    under prefers-reduced-motion).
  - User speaks → speech-to-text transcribes into the composer/chat as the
    user message (existing STT pipeline; live transcript in body-lg italic
    per the standard).
  - Assistant reply arrives as a normal text bubble, THEN is read aloud via
    TTS — text always renders first; speech is additive.
  - While the session stays ON, subsequent replies are also spoken.
  - **Tap X → session OFF:** immediately stop any in-progress speech
    (speechSynthesis.cancel() or equivalent), hide the X, return to pure
    text chat. TTS never plays when the session is off.
- Tab switch / app close killing TTS is intended (browser behavior). On
  returning to the tab, do not resume speech; the reply text is already there.
- No TTS ever plays outside an active voice session — audit for any global
  auto-speak and remove it.

**Test criteria:** mic toggles session; X appears only during a session;
mid-sentence X cuts speech instantly; replies render as text before being
spoken; no speech after session off; reduced-motion swaps pulse for static.

**Commit:** `feat(voice): revert to push-to-talk sessions, remove orb mode`

---

## Item 3 — Notification priming card *(build only after paywall scaffold merges)*

**Problem:** Browsers auto-punish cold permission prompts; the reminder toggle
buried in Settings never gets discovered. Prime at the moment of value instead.

**Spec:**
- Trigger: immediately after a user successfully SENDS their FIRST invoice
  (not creates — sends), show an in-app card (not a browser prompt) beneath
  the sent confirmation: surface-container-low, 20px radius,
  Material Symbol `notifications` in primary:
  > **"Want a nudge if this goes unpaid?"**
  > "We'll remind you in 2 days so you can follow up — and you can mark it
  > paid right from the reminder."
  > [Remind me] (56px gold pill) · [No thanks] (quiet text)
- Behavior by tier (all checks via the single hasAccess()):
  - **Pro / founder:** [Remind me] fires the real browser permission request;
    on grant, enable the same preference the Settings toggle controls. On deny,
    dismiss gracefully (no nagging).
  - **Free:** reminders are Pro-only — the card shows the standard PRO chip
    and [Remind me] opens the paywall modal (this is a legitimate upsell
    surface per the established rules; it is user-initiated, so it does not
    count against the once-per-session auto-open cap).
- Frequency: the card shows ONCE ever per user (persist a dismissed/handled
  flag on the profile, not localStorage — devices change). [No thanks]
  permanently dismisses; Settings remains the manual path.
- Never fire the raw browser permission prompt on page load or any
  non-user-initiated moment, anywhere in the app. Audit and remove if found.

**Test criteria:** card appears exactly once after first send; free user path
opens paywall; pro path reaches the browser prompt; deny is graceful; flag
persists across devices/sessions.

**Commit:** `feat(notifications): first-invoice priming card, tier-aware`
