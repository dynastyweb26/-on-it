# Recap redesign: build rules

Source of truth: `RecapPlayer.dc.html` (the slides) and
`On_It_Recap_Redesign.dc.html` (the board of states). Claude Design export,
2026-11-15. `SCREEN-MAP.md` maps each slide to its repo files.

Founder decisions that settle what the files leave open:

1. Affirmation slide: variant A is final (Montserrat text, no signature, no
   signer name). Variants B, C and D and the Caveat font are not built.
2. The line under Share reads "-by On It CEO" (the file says "Onit"; the
   founder corrected the spelling).
3. Weekly uses this design. Monthly reuses it, but keeps its existing first
   pages. Do not redesign those.
4. Every number, name, chart and list is the user's real data. Each dynamic
   element carries `data-f="<field>"`; that is the field list.
5. Every element animates as the file specifies (`data-a`, `data-d`,
   `data-dur`). Nothing just appears.
6. The sound button is drawn and toggles its icon. It plays nothing yet.
7. Bank activity and "Waiting for you" slides are built after the tiers work
   (they need the Plus plan). Until then they never show.
8. Light only. Material Symbols Outlined only. No emojis.
