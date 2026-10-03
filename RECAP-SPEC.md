# On It — Recap Spec (weekly / monthly "Wrapped" story)

Source of truth for look, timing and motion: the approved prototype
`design-reference/recap-prototype.html` (Claude Design export, 2026-10-02).
This file carries everything needed to build it, so later sessions don't have
to unpack the 1.3 MB bundle. **If this file and the prototype disagree, the
prototype wins on look/motion; this file wins on product rules** (the RULES
section and anything marked "On It build").

The prototype is a self-unpacking bundle: a `__bundler/manifest` script tag
holds gzipped base64 resources (6 JS files, 3 SVGs, 13 woff2 fonts) and
`__bundler/template` holds the page. To re-extract: parse both tags, base64
decode, gunzip where `compressed: true`. The JS files are:

| File (prototype) | What it is | Section here |
|---|---|---|
| `config.js` | every timing, easing, sound level | §3, §4, §6 |
| `data.js` | 8 scenario payloads + copy | §7, §8 |
| `util.js` | beat resolver, easing, ring/receipt/band shapes (its unused `horizon` shape is not ported) | §3, §5 |
| `audio.js` | placeholder synth (Web Audio) | §6 |
| `slides.js` | the 10 slides (markup + animations) | §5 |
| `player.js` | story player: clock, input, transitions, mute | §2 |

## 0. Rules (On It build)

- On It design tokens only (`tailwind.config.ts`, `tokens.css`); `#d4af37` is
  never text (labels use `#735c00` on light, on-ink tokens on dark).
- Material Symbols Outlined only (add names to `icon-names.ts` + `npm run icons:build`).
  No emojis. No tax / deductible wording anywhere in the recap.
- Payment marks: `simple-icons` (same approach as `feat/paywall-v2`
  `PaymentLogos.tsx`), not the prototype's color discs.
- Paid-only (already gated on `feat/recap`), and hidden behind `RECAPS_LIVE`
  until launch.
- Reduce Motion: opacity fades only (350 ms per element, 280 ms slide
  cross-fade), numbers shown final, no count-ups, no tick sounds.
- Animate `transform` / `opacity` (plus the SVG stroke/clip/offset properties
  the prototype uses); see §9 for the expensive effects and how to keep them cheap.
- Recap code loads only when a recap opens (dynamic import).

## 0b. Decisions (2026-10-02, on top of the prototype)

- "Still on the table": no "Send reminders" (no backend; PUNCH-LIST "Bulk
  payment reminders — later"). "View invoices" (unpaid list) is the gold button.
- The old sheet's Income / Expenses PDF buttons move to each row of the recap
  history list; paid-only, locked rows open the paywall (reports variant).
- Nothing-at-all periods: snapshot built (Books card "Quiet week"), no push,
  no prompt (`recapAnnounces`).
- Delivery stays on the daily 15:00 UTC cron (Monday 8–11am across the
  continental US). iOS 16+ floor.
- Categories: top 4 + "other" (data-1..5). Inter 500 in the prototype maps to
  the app's 400/600. React components, not HTML strings. Hero numbers auto-fit;
  names truncate. Performance substitutions and the audio approach as in the
  audit (cheap transition: dark overlay + composited slide, no animated
  filter/clip-path/blend; `navigator.audioSession.type = 'ambient'`).
- One shared `RECAPS_LIVE` (`src/lib/recaps-live.ts`). Books dot: unwatched
  recaps from the last 14 days only.
- Slide order adds two guards to `R.sequence` (`recapSequence`): no kept slide
  when $0 in and $0 out; no glance slide for a $0 month.
- **Decision 6 — Opener: COLUMNS + RIBBON** (the prototype's opener;
  corrected 2026-10-02 — an earlier "horizon line" decision was a spec
  mistake, built once in `e417089` and replaced; **do not bring the horizon
  back**). **Weekly = 7 day columns; monthly = 4–5 calendar-week columns**
  (Mon–Sun weeks clipped to the month; a first or last week of ≤ 3 days merges
  into the adjacent week, e.g. Sep 28–30 into 21–27 → 21–30, so always 4–5,
  never 6; a merged column longer than 7 days counts at its 7-day rate;
  derived at render time from the stored daily series — no extra payload
  field). Heights from the column's
  income, scaled against the stored `previous` period so a quiet period stands
  lower than a busy one; zero columns stay as small stubs, never invisible. The
  ribbon of light sweeps the tops; the small swoosh riding its head hands off
  to the big mark behind the title. **No value label ("$800") and no day-label
  axis.** Full spec in §4 / §5 "opener". `monthWeeks()` stays for the glance
  slide only.

## 1. Slide sequence

```js
// R.sequence(d)
if (!income.total && !spend.total && !owed.invoices.length && !paidInvoices.length) return ['quiet'];
['opener',
 income.total > 0 ? 'moneyIn' : 'moneyInZero',
 ...(spend.total > 0 ? ['moneyOut'] : []),
 net >= 0 && income.total > 0 ? 'kept' : 'keptInvest',
 ...(period === 'month' ? ['glance'] : []),
 owed.invoices.length ? 'owed' : 'caughtUp']
```

Slide names: Opener · Money in · Money in ($0 week) · Money out · What you kept ·
What you kept (investment) · Month at a glance · Still on the table ·
All caught up · Nothing at all.

Hard-week variants: **quiet** ($0 in → `moneyInZero`), **investment week**
(spent > earned → `keptInvest`, no ring, no glow), **caught up** (nothing owed →
`caughtUp`), **nothing at all** (one `quiet` card, no story chrome beyond close).

## 2. Player

- Canvas: 393 × 852 design px (iPhone 15/16). The prototype positions with
  absolute px; `R.rel` divides by `width/393`, so everything is authored for a
  393-wide screen.
- **One clock**: a single `requestAnimationFrame` loop advances slide time `t`
  (dt capped at 64 ms) → `Slide.seek(t)` sets `currentTime` on every WAAPI
  animation (all created paused), updates count-ups, and fires sound cues whose
  time falls in `(prevT, t]`.
- **Auto-advance**: a slide's duration = `heroEnd + hold`. The progress segment
  for the current slide fills only from `heroEnd` to the end (`scaleX`), i.e. the
  timer starts after the hero animation. Last slide holds at its end.
- **Input** (whole screen, `touch-action:none`):
  - tap right two-thirds → next; left third (`backZone 1/3`) → previous
    (previous at index 0 = replay slide 0);
  - press and hold ≥ 220 ms → pause (a "Paused" pill shows; music pauses); release resumes, no navigation;
  - pointerleave while held → resume;
  - elements with `data-act` (mute, close, CTAs) handle their own taps.
- **Chrome** (top, over the slides, `pointer-events:none` except buttons):
  progress segments at top 58 px (16 px side insets, 4 px gap, 3 px tall,
  track `rgba(127,118,100,.3)`, fill `currentColor`); header row at 72 px:
  app icon 26 px + "Weekly recap" / "Monthly recap" (600 13 px), right: mute
  (`volume_up` / `volume_off`) and close (`close`) 40 px round buttons
  (bg `rgba(31,27,19,.06)` light, `rgba(255,248,240,.1)` dark). Chrome colour
  follows the slide theme (ink on light, cream on dark); theme flips at 50 % of
  the transition.
- **Mute** persists in `localStorage['onit-recap-muted'] = '1' | '0'`.
- **Close** stops music (600 ms fade), tears the slides down.
- Real-time in the On It build: no slow-mo, no test panel, no lock screen
  (those are prototype-only).

## 3. Timing engine

Times are ms from slide start. A beat is
`{ delay, dur, stagger?, ease? }`; `delay` is a number or a reference
`"beat.start" | "beat.end"` plus optional `±offset` (e.g. `"count.end+250"`).
The slide supplies each beat's item count `n`:
`beat.end = start + (n-1)*stagger + dur` (`n = 0` → zero-length beat at `start`).
`heroEnd` names the beat edge where the auto-advance timer starts; then `hold`.

Animation kinds: `'in'` (entrance — becomes an opacity fade under Reduce
Motion), `'move'` / `'fx'` (dropped entirely under Reduce Motion). Static CSS is
the settled end state; animations go FROM something TO that state, so
dropping one leaves the right final frame.

Helpers: `fadeUp(el, beat, {dy=12})` = opacity 0 + translateY(dy) → none;
`pop` = opacity 0 + scale(.6) → none; `grow(el, beat, axis)` = scaleX/Y(0) → none;
`number(el, value, beat)` = count from 0 with the beat's ease, element fades in
over 200 ms (Reduce Motion: final value, no count).

Count-up ticks: for a `ticks` cue with `count: N`, one tick fires each time the
eased progress crosses k/N (k = 1..N) — ticks bunch at the start and spread out
as the number slows. No ticks under Reduce Motion.

### Easing

| name | curve | use |
|---|---|---|
| linear | linear | ring sweep |
| out | cubic-bezier(.33,1,.68,1) | default entrance |
| outQuart | cubic-bezier(.25,1,.5,1) | count-ups |
| inOut | cubic-bezier(.65,0,.35,1) | wipes, sweeps, squaring up (= app `--ease-emphasized`) |
| back | cubic-bezier(.34,1.56,.64,1) | settle with overshoot (= app `--ease-spring`) |
| snap | cubic-bezier(.3,1.75,.5,1) | band locking on |

### Transition (swoosh wipe), 700 ms `inOut`

Next (dir +1): the outgoing slide sits on top and is clipped away left → right
(`clip-path: inset(0 0 0 0)` → `inset(0 0 0 393px)`) while dimming
`brightness(1 → .75)`; the incoming slide is underneath, already playing from
t = 0. A gold swoosh mark (340 × 269, `drop-shadow(0 0 24px rgba(212,175,55,.7))`,
top 300 px) travels with the wipe edge: `translateX(-170 → 223)`,
`rotate(-12° → 0 → 12°)`, `scale(.9 → 1.15 → .9)`, opacity 0 → 1 (20 %) → 1 (80 %) → 0.
A 140 px light band (`linear-gradient(90deg, transparent, rgba(240,205,110,.45), transparent)`,
`mix-blend-mode: screen`) travels `-70 → 323`, opacity peaking at 50 %.
Previous (dir −1) mirrors it right → left. Cue: `whoosh` −14 dB at start.
Reduce Motion: outgoing slide opacity 1 → 0 over 280 ms, linear, no mark/band.
Tapping during a transition finishes it instantly and starts the next.

## 4. Per-slide timing (resolved)

Representative item counts noted per slide; the config in §10 is the
source to re-resolve for other counts.

#### opener — COLUMNS + RIBBON (decision 6) · heroEnd 2754 ms · total 5154 ms

Same timing weekly (7 day columns) and monthly (4–5 calendar-week columns):
the column wave has a fixed `span`, so stagger = 540 / (n − 1) (weekly = the
prototype's 90 ms). Config to use in
place of §10's `opener` (the prototype's minus its `days` and `peak` beats,
plus `span`, and the mark starting at the hand-off):

```js
opener: {
  theme: 'dark', heroEnd: 'mark.end', hold: 2400,
  beats: {
    cols:  { delay: 150, dur: 900, stagger: 90, span: 540, ease: 'back' }, // 7 days, or 4–5 calendar weeks
    sweep: { delay: 'cols.end-400', dur: 1300, ease: 'inOut' },          // ribbon across the tops
    mark:  { delay: 'sweep.start+664', dur: 900, ease: 'out' },          // hand-off → settles behind the title
    label: { delay: 'mark.start+200', dur: 500 },
    title: { delay: 'mark.start+350', dur: 650 },
    range: { delay: 'mark.start+600', dur: 500 },
    aff:   { delay: 'mark.start+1100', dur: 800 }
  },
  cues: [
    { at: 'sweep.start', sound: 'sweep', db: -18, label: 'Ribbon sweep' },
    { at: 'mark.end', sound: 'chime', db: -20, label: 'Swoosh settles (soft)' }
  ]
}
```

| beat | start | end | dur | stagger | ease |
|---|---|---|---|---|---|
| cols | 150 | 1590 | 900 | 540/(n−1) | back |
| sweep (+ rider) | 1190 | 2490 | 1300 |  | inOut |
| mark (hand-off) | 1854 | 2754 | 900 |  | out |
| label | 2054 | 2554 | 500 |  | out |
| title | 2204 | 2854 | 650 |  | out |
| range | 2454 | 2954 | 500 |  | out |
| aff | 2954 | 3754 | 800 |  | out |

`sweep.start+664`: the ribbon head travels 0 → 160 % of the path over the
inOut sweep, so it passes 85 % of the path when the eased progress is
85/160, at 51.1 % of 1300 ms (bezier solver, as for the count-up ticks).

Cues: 1190 ms sweep −18 dB · 2754 ms chime −20 dB

#### moneyIn — 3 payment methods · heroEnd 3250 ms · total 6050 ms

| beat | start | end | dur | stagger | ease |
|---|---|---|---|---|---|
| label | 100 | 600 | 500 |  | out |
| lead | 200 | 700 | 500 |  | out |
| count | 400 | 2400 | 2000 |  | outQuart |
| chips | 500 | 1670 | 650 | 260 | back |
| pour | 950 | 1990 | 520 | 260 | inOut |
| segs | 1370 | 2450 | 560 | 260 | out |
| pct | 1730 | 2550 | 300 | 260 | out |
| caption | 2200 | 2700 | 500 |  | out |
| card | 2650 | 3250 | 600 |  | out |
| share | 2900 | 3800 | 900 |  | out |

Cues: 400 ms none (tick run starts) -26 dB · 950 ms drop -24 dB · 1210 ms drop -24 dB · 1470 ms drop -24 dB · 2400 ms chime -12 dB

#### moneyInZero — 3 open invoices · heroEnd 3380 ms · total 5980 ms

| beat | start | end | dur | stagger | ease |
|---|---|---|---|---|---|
| label | 100 | 600 | 500 |  | out |
| title | 250 | 850 | 600 |  | out |
| body | 600 | 1100 | 500 |  | out |
| rows | 1000 | 2080 | 600 | 240 | out |
| total | 2180 | 3380 | 1200 |  | outQuart |

Cues: 2180 ms none (tick run starts) -28 dB

#### moneyOut — 3 receipts, 3 trips · heroEnd 3700 ms · total 6500 ms

| beat | start | end | dur | stagger | ease |
|---|---|---|---|---|---|
| label | 100 | 600 | 500 |  | out |
| lead | 200 | 700 | 500 |  | out |
| count | 400 | 2000 | 1600 |  | outQuart |
| receipts | 450 | 1850 | 800 | 300 | out |
| ring | 1500 | 2800 | 1300 |  | linear |
| center | 2600 | 3100 | 500 |  | out |
| legend | 2800 | 3300 | 500 |  | out |
| card | 3100 | 3700 | 600 |  | out |
| trips | 3400 | 4080 | 400 | 140 | out |

Cues: 400 ms none (tick run starts) -26 dB · 450 ms flutter -22 dB · 750 ms flutter -22 dB · 1050 ms flutter -22 dB · 2000 ms chime -14 dB

#### kept —  · heroEnd 3000 ms · total 5600 ms

| beat | start | end | dur | stagger | ease |
|---|---|---|---|---|---|
| label | 100 | 600 | 500 |  | out |
| lead | 200 | 700 | 500 |  | out |
| ring | 400 | 2400 | 2000 |  | out |
| caption | 1800 | 2300 | 500 |  | out |
| chip | 2500 | 3000 | 500 |  | back |
| foot | 2800 | 3300 | 500 |  | out |

Cues: 400 ms none (tick run starts) -26 dB · 2400 ms chime -12 dB

#### keptInvest — 3 categories · heroEnd 3100 ms · total 5700 ms

| beat | start | end | dur | stagger | ease |
|---|---|---|---|---|---|
| label | 100 | 600 | 500 |  | out |
| title | 250 | 850 | 600 |  | out |
| count | 800 | 2200 | 1400 |  | outQuart |
| inBar | 1000 | 1900 | 900 |  | out |
| outBars | 1200 | 2400 | 800 | 200 | out |
| chip | 2600 | 3100 | 500 |  | out |

Cues: 800 ms none (tick run starts) -28 dB · 2200 ms chime -22 dB

#### glance — 4 weeks · heroEnd 3000 ms · total 5600 ms

| beat | start | end | dur | stagger | ease |
|---|---|---|---|---|---|
| label | 100 | 600 | 500 |  | out |
| title | 250 | 850 | 600 |  | out |
| sub | 500 | 1000 | 500 |  | out |
| total | 500 | 2100 | 1600 |  | outQuart |
| bars | 700 | 2200 | 900 | 200 | out |
| vals | 1300 | 2300 | 400 | 200 | out |
| card | 2400 | 3000 | 600 |  | out |

Cues: 500 ms none (tick run starts) -26 dB · 2100 ms chime -12 dB

#### owed — 3 invoices (no edges, no +N) · heroEnd 2350 ms · total 5350 ms

| beat | start | end | dur | stagger | ease |
|---|---|---|---|---|---|
| label | 100 | 600 | 500 |  | out |
| lead | 200 | 700 | 500 |  | out |
| count | 400 | 2000 | 1600 |  | outQuart |
| countcap | 1700 | 2200 | 500 |  | out |
| cards | 900 | 1950 | 650 | 200 | back |
| edges | 1700 | 1700 | 400 | 50 | out |
| more | 1750 | 1750 | 400 |  | back |
| lines | 1850 | 2350 | 500 |  | out |
| cta | 2250 | 2750 | 500 |  | out |
| closing | 2650 | 3150 | 500 |  | out |

Cues: 400 ms none (tick run starts) -26 dB · 2000 ms chime -12 dB

#### caughtUp — 4 paid (3 cards + 1 edge, +1 more) · heroEnd 2930 ms · total 5330 ms

| beat | start | end | dur | stagger | ease |
|---|---|---|---|---|---|
| label | 100 | 600 | 500 |  | out |
| caption | 250 | 750 | 500 |  | out |
| edges | 100 | 500 | 400 | 40 | out |
| cards | 100 | 790 | 450 | 120 | out |
| stamp | 560 | 1390 | 170 | 330 | back |
| ripple | 1490 | 1690 | 200 | 40 | out |
| square | 1730 | 2090 | 360 |  | inOut |
| band | 2090 | 2430 | 340 |  | snap |
| mark | 2310 | 2650 | 340 |  | back |
| glint | 2430 | 2930 | 500 |  | out |
| more | 1690 | 2090 | 400 |  | back |
| title | 2530 | 3130 | 600 |  | out |
| body | 2730 | 3230 | 500 |  | out |
| cta | 2980 | 3480 | 500 |  | out |
| closing | 3230 | 3730 | 500 |  | out |

Cues: 560 ms stamp -14 dB · 890 ms stamp -14 dB · 1220 ms stamp -14 dB · 1490 ms ripple -20 dB · 2430 ms snap -10 dB · 2430 ms glint -24 dB

#### quiet —  · heroEnd 850 ms · total 3850 ms

| beat | start | end | dur | stagger | ease |
|---|---|---|---|---|---|
| card | 150 | 850 | 700 |  | out |

## 5. Slides — layout and motion

Shared: content box `left/right 28px, top 136px, bottom 40px`, column flex,
`.rc-spacer` pushes cards to the bottom. Label: Inter 600 12px, `.12em`,
uppercase, `#735c00` on light / `--on-ink-muted #cfc3ad` on dark. Lead:
Montserrat 700 22/28. Hero number: Montserrat 800 88/92, `-.03em`, tabular.
Caption: Inter 500 15/20 secondary. H2: Montserrat 800 36/40 balance.
Body: Inter 400 17/25 secondary. Themes: light = cream + white top glow + faint
gold bottom glow; dark = ink + gold bottom glow (radial gradients, §12).

Money: whole dollars, `−$` for negatives (`R.money`).

### opener (dark) — COLUMNS + RIBBON (decision 6)

The prototype's columns opener (slides.js `opener`), with these On It build
changes. Built in `src/components/recap/slides/OpenerSlide.tsx`, geometry in
`src/lib/recap/columns.ts`.

**Columns** (393 × 852 canvas; floor `BASE = 748`, row x 28 → 365)
- Weekly: one per day, `payload.daily` (7), 30 px wide (prototype).
- Monthly: one per **calendar week** — Mon–Sun weeks clipped to the month
  (`calendarWeeks()`), then a first or last week of **≤ 3 days merges into
  the adjacent week** (`monthColumns()`; e.g. Sep 2026 = Tue 1–Sun 6, 7–13,
  14–20, 21–30). Every 28–31-day month gives **4 or 5** columns (never 6) and
  no edge column of ≤ 3 days; a Sunday-start 31-day month gives 4 (1–8, 9–15,
  16–22, 23–31). 52 px wide (the prototype's week column). Derived at render
  time from `payload.daily` and `payload.start`; nothing extra stored.
- Column value: the week's income total, except a **merged column longer
  than 7 days counts at its 7-day rate** (total × 7 / days), so a 10-day bar
  isn't taller than a week's worth. Unmerged 4–6-day edge weeks keep their
  real total (not scaled up: one payment in a short week would become a
  giant bar).
- Height = `max(14, v / max × 210 × amp)`; a zero column = a **6 px stub**
  (`rgba(212,175,55,.45)`, fully rounded), never invisible. Real columns use
  the prototype's gradient (`transparent → .32 → .85 → #fff1c9`), rounded
  tops, plus a reflection under the floor (opacity .5) and the floor
  hairline. The prototype's large `box-shadow` glow is dropped (§9).
- `amp = 0.4 + 0.6 × min(1, avg column / ref)`, `ref` = the previous
  period's income per column: previous week ÷ 7; previous **month** ÷ its own
  number of columns (same merge rule). No previous income → 0.75.
- **Not built:** day/week labels (`rc-day`) and the peak value label (`rc-peak`).

**Ribbon**
- Catmull-Rom → cubic Bézier through every column top + 22 px (prototype),
  weekly and monthly alike, bleeding past both edges (x −30 → 423).
- Trail = three stacked strokes, no blur (§9): 18 px `#d4af37` .14 (L .45),
  6 px `#e8c766` .45 (L .26), 3 px `#fff1c9` (L .12); `pathLength 100`,
  `stroke-dasharray L 300`, `stroke-dashoffset L → L − 160` on `sweep` (the
  head runs 0 → 160 so the trail leaves the screen).
- Rider: the small gold swoosh (54 × 43, `offset-anchor 50% 100%`,
  `offset-rotate auto`, radial-gradient glow) on the head
  (`offset-distance 0 → 100 %` by eased 62.5 %, like the prototype's spark).
- **Hand-off:** at `mark.start` (head at 85 %) the big mark (`.rc-mark`,
  300 × 237 behind the title) starts on the rider — same spot, angle and size
  (`scale(54/300)`) — and settles to rest (opacity .62) over `mark`; the
  rider fades in 80 ms. Verified within 1–4 px at 375/393/430 widths.

**Text** (prototype): label "Weekly recap" / "Monthly recap", title "Your
week, On It." / "Your {Month}, On It.", range "Sep 22 – Sep 28", affirmation
(rotates per open, `onit-recap-opens`).

**Layout:** text and mark under the chrome. Columns full width, the canvas's
bottom on the screen's bottom; squashed vertically only when the room under
the text (affirmation counted as two lines, so the height doesn't change per
open) is shorter than the tallest possible column + ribbon (`CEILING`) —
the same cap for every period. Bars never overlap the text (SE in Safari
checked).

**Reduce Motion:** no rise, sweep, rider or hand-off: columns, reflections
and the resting mark fade (350 ms), then the text.

**Checkpoint fixtures:** busy month, quiet month, spiky month, one-payment
week, $0 week, normal week.

### moneyIn (light)
- "Money in" / "You brought in" / hero count-up / "4 payments · 3 clients".
- **Payment chips** (one per method with amount > 0): pill 36 px, white,
  1.5 px border in brand colour, mark 26 px + name + amount. Chips drop in from
  translateY(-60) (back, stagger 260).
- **Pour**: a 16 px glowing drop leaves each chip's mark, arcs (26 px lift at
  55 %) into the centre of its bar segment and shrinks out (fx).
- **Segmented bar** 64 px tall, radius 18, track `--onit-track`, inset shadow;
  each segment reveals with `clip-path: inset(0 100% 0 0) → inset(0)`, its %
  label fades in after; a sheen gradient sits on top.
- Bottom card: "{Top client} was your top client." / "Paid $X, N% of the
  week." + 8 px share bar (gold gradient) growing scaleX.
- Brand colours in the prototype: Zelle `#6D1ED4`, Cash App `#00C244`,
  Card `#635BFF`. On It build: marks + hex from `simple-icons`
  (Zelle, Cash App); methods without a brand mark (card, cash, check, other) use a
  Material Symbol in a neutral chip (see the audit).

### moneyInZero (light, calm)
- "Quiet week on payments." / "Your invoices are still working. N are out
  there." (or "Nothing came in this time.") · up to 3 open invoices as white
  rows (client, Viewed/Sent dot, amount) sliding in from x −28 · "Out there ·
  N more" + total count-up. Ticks only, **no chime**.

### moneyOut (dark)
- "Money out" / "You spent" / hero count-up.
- **Category ring** 176 px (r 72): track `rgba(255,248,240,.06)`; segments by
  share in category order, first (largest) 22 px wide, others 14 px, 1.2 gap;
  a blurred copy of the first segment glows. Segments draw one after another
  across the 1300 ms linear `ring` beat (each segment's slice of time = its
  share). Centre: top category name + its %.
- **Receipts** (up to 3, largest first): torn-bottom paper cards (CSS mask
  scallop), rotated −5° / 4° / −2°, fluttering in from above with a zig-zag
  (0 → 35 % → 70 % → 100 % keyframes), `paper flutter` cue on each.
- Legend chips (square 10 px swatch, name, amount).
- Bottom dark card: "Most of it at {vendor}: $X across N trips." (or "in one
  trip") + a row of trip bars (each trip's width = share × 78 %) growing in.
- Category colours: `--onit-data-1..5` = `#d4af37 #2f8a83 #c0693f #5b77a8 #6f8c5c`
  (prototype maps Supplies, Fuel, Tools, Vehicle, Other).

### kept (light) — net ≥ 0 and income > 0
- "What you kept" / "You kept" / **300 px ring** (r 128, 24 px stroke, round
  caps, gold gradient `#f1d57c → #d4af37 → #b8952a`, track `--onit-track`,
  blurred glow copy at .35). Fill = net / income. Ring fill and the net
  count-up share one 2000 ms `out` beat; a cream spark rides the arc head.
  Centre disc `radial-gradient(#fff, #fbf2e3)`. "of $X brought in".
- Change chip pops (back): "Up 18% from last week" (`trending_up`, success
  tint) or "Down …" (`trending_down`, neutral chip). Foot: "$X in · $Y out".

### keptInvest (light) — net < 0 or income = 0
- "This week was an investment week." · "Net this week" + count-up (−$480) ·
  two 16 px bars: Brought in (gold gradient) and Spent (category-coloured
  pieces), widths relative to the larger · chip "Most went to Tools: $780".
  Soft chime (−22 dB), no ring, no glow.

### glance (light) — monthly only, after kept
- Label = month name; "Your month at a glance"; "$X brought in over N weeks"
  (count-up) · weekly bars (max 230 px, best week in gold with glow, others
  `#efe4cf → #e3d5bb`), values above, labels below · "Best week" card
  (2 px gold border + 4 px gold halo).

### owed (dark) — "Still on the table"
- "Still owed to you" / hero 76/80 count-up / "N invoices".
- **3 cards** max (largest first), 60 px tall, 6 px gap, cream paper gradient:
  client, "Viewed · Sep 26" (gold dot) or "Sent · Sep 28" (muted dot), amount.
  They slide in from `translate(48px,-6px) rotate(4+2i deg)` (back).
- **Stacked edges** for the rest: up to 6 layers 5 px apart under the last
  card, each inset 7 px more per side, darkening (`hsl(36, 30−2j%, 80−7j%)`).
  **"+N more"** pill pops under the stack.
- Lines: "**2** clients opened their invoice but haven't paid yet." /
  "**1** quote waiting on an answer." (each only when > 0).
- CTA: gold "Send reminders" + underlined "View invoices"; closing line
  "Go get it this week." (see audit: no reminder-sending backend exists).

### caughtUp (dark) — nothing owed. Band lands ≤ 3 s at any invoice count
- Caption "N invoices paid · $X" (or "Nothing outstanding").
- A bundle of the period's paid invoices (260 × 170 cards at 66,214):
  up to 3 full cards fanned (`(-12,-8,-7°)`, `(16,6,6°)`, `(-8,14,-3°)`), the rest
  as ≤6 stacked edges. Bottom card lands and stamps first. Each card slides in
  from x +320 rotate 10°; a green **PAID** stamp slams from scale 1.9 (back,
  170 ms, 330 ms apart) with a 3 px dip of the card; edges then **ripple**
  (green bottom border + glow, 40 ms apart); the fan **squares up** (360 ms
  inOut); a gold **band** wraps the bundle (scaleX 0→1, snap), a cream swoosh
  pops on it, a white **glint** crosses it. "+N more paid" pill.
- "You're all caught up." / "Nobody owes you a dime." / "Make an invoice" /
  closing line.

### quiet (light) — nothing at all
- One white card (radius 28): app icon 72 px, "Quiet week." / "Ready when you
  are." / "Make an invoice". Card fades up 20 px over 700 ms. No cues.

## 6. Sound

All sounds in the prototype are **placeholders** synthesized with Web Audio;
the licensed set swaps in as decoded buffers under the same names.

Bus: `out` (mute = gain → 0 with a 30 ms time constant) ← `fx` (cues) +
`musicBus` ← `duckNode` ← lowpass 1400 Hz ← music voices.

**Music bed**: 90 BPM, 12-bar loop (Fmaj7 · Em7 · Dm7 · Cmaj7, 3 bars each),
level −24 dB (gain ×4 in the placeholder), fade in 1200 ms when the story
opens, fade out 600 ms on close, pauses (80 ms) while held. `chime` and `snap`
duck the music by −4 dB, recovering over 700 ms. Starts on the first tap
(user gesture; required on iOS).

| Sound | Placeholder synthesis | Where (slide · beat) | dB |
|---|---|---|---|
| whoosh | band-passed noise 300 → 2600 Hz, 450 ms | every transition | −14 |
| sweep | band-passed noise 220 → 3200 Hz, 1.2 s | opener · sweep.start | −18 |
| chime | C5 / G5 / C6 sines + C4 triangle, 1.4 s; ducks music | opener mark.end (−20) · moneyIn count.end (−12) · moneyOut count.end (−14) · kept ring.end (−12) · keptInvest count.end (−22) · glance total.end (−12) · owed count.end (−12) | see left |
| tick | 2600 Hz square blip, 18 ms | count-ups: moneyIn 14 (−26), moneyInZero 10 (−28), moneyOut 12 (−26), kept 14 (−26), keptInvest 10 (−28), glance 12 (−26), owed 12 (−26) | see left |
| drop | 880 + 660 Hz sine blips | moneyIn · pour.each | −24 |
| flutter | high-passed noise 3000 → 1800 Hz, 280 ms | moneyOut · receipts.each | −22 |
| stamp | 110 Hz thump + low-passed noise | caughtUp · stamp.each | −14 |
| ripple | 6 low noise taps, 40 ms apart | caughtUp · ripple.start | −20 |
| snap | noise click + 150 Hz + 82 Hz; ducks music | caughtUp · band.end | −10 |
| glint | 1568 + 2093 Hz sines, 60 ms apart | caughtUp · glint.start | −24 |

Notes from the prototype panel: a browser can't read the iPhone silent switch;
the plan is an ambient audio session so silent mode mutes it (see the audit for
what a PWA can actually do).

## 7. Payload shape (one per recap)

The prototype's scenario object is shaped like a real recap payload:

| Field | Type | Meaning |
|---|---|---|
| `period` | `'week' \| 'month'` | |
| `periodLabel` | string | "Sep 22 – Sep 28" / "Sep 1 – Sep 30" |
| `monthName` | string \| null | "September" (monthly only) |
| `income` | `{ total, payments, clients }` | cash in during the period |
| `spend` | `{ total, categories: [{name, amount}] (desc), receipts: [{vendor, amount, category}] (3 largest) }` | |
| `net` | number | income − spend |
| `change.net` | `{ pct, direction: 'up'\|'down'\|'flat', vs: 'last week'\|'{Prev month}' }` | vs the previous period |
| `daily` | number[] | income per local day (7, or days in month) |
| `dayLabels` | string[] | weekday initials starting at the first day |
| `weeks` | `[{label, amount}]` \| null | monthly: 1–7, 8–14, 15–21, 22–end |
| `topClient` | `{ name, amount }` \| null | |
| `topVendor` | `{ name, amount, category, trips: number[] }` \| null | trips = that store's expense amounts |
| `paymentMethods` | `[{ method, amount }]` (desc) | |
| `owed` | `{ total, invoices: [{ id, client, amount, status: 'viewed'\|'sent', date }] }` | as of build time |
| `viewedUnpaid` | number | owed invoices the client opened |
| `quotesPending` | number | sent quotes with no answer |
| `paidInvoices` | `[{ id, client, amount, status: 'paid', date }]` | invoices paid in the period (caught-up bundle) |
| `notifyDate` | string | prototype lock screen only |
| `previous` (On It build, opener commit) | `{ income, expenses }` | previous period's totals; `income` ÷ its columns (7 days / its 4–5 merged calendar weeks) sets the opener columns' height `ref` |

Invoice-count override (QA): 1 / 3 / 7 / 20 invoices replaces `owed.invoices`
(with 1 / 2 / 4 / 11 viewed) or, when nothing is owed, `paidInvoices`.

## 8. Copy

- Push / lock screen: title "Your week is ready" / "Your {Month} is ready";
  body "Tap to see how you did."
- Affirmations (opener, rotate per open):
  "Keep building a business you're proud of." · "Every invoice is proof of
  work." · "Steady hands. Steady growth." · "You showed up. It shows." ·
  "Good work gets paid."
- Closing line (owed, caught up): "Go get it this week." / "… this month."
- Everything else is quoted in §5.

## 9. Expensive effects (flagged in the prototype)

`filter: blur()` on SVG strokes (prototype opener ribbon trail, money-out ring
glow, kept ring glow), large `box-shadow` glows on the light columns
(dropped in the On It build) and drops,
`backdrop-filter` (lock-screen only, not built), `mix-blend-mode: screen`
(transition band), `filter: brightness()` on the outgoing slide during every
transition, `drop-shadow` on the swoosh mark, and the 43 KB traced swoosh path.
The audit has the plan for each.

Columns opener: the ribbon glow is stacked strokes (no `blur()`), the
columns animate transform/opacity only (no `box-shadow`), the rider and mark
glows are radial-gradient divs (no `drop-shadow` filter), and the rider's
`offset-path` needs iOS 16+ (the floor).

## 10. Timing config (verbatim, `OnItRecap.CONFIG`)

`slides.opener` below is the prototype's columns opener; the On It build
uses the adjusted columns + ribbon config in §4 (no `days` / `peak` beats,
`span`, mark at the hand-off). Everything else stands.

```json
{
  "ease": {
    "linear": "linear",
    "out": "cubic-bezier(.33,1,.68,1)",
    "outQuart": "cubic-bezier(.25,1,.5,1)",
    "inOut": "cubic-bezier(.65,0,.35,1)",
    "back": "cubic-bezier(.34,1.56,.64,1)",
    "snap": "cubic-bezier(.3,1.75,.5,1)"
  },
  "transition": {
    "dur": 700,
    "ease": "inOut",
    "dim": 0.75,
    "markWidth": 340,
    "cue": {
      "sound": "whoosh",
      "db": -14,
      "label": "Swoosh wipe"
    }
  },
  "reduce": {
    "fade": 350,
    "transition": 280
  },
  "input": {
    "holdToPause": 220,
    "backZone": 0.3333333333333333
  },
  "slowMo": 0.25,
  "categoryColor": {
    "Supplies": "var(--onit-data-1)",
    "Fuel": "var(--onit-data-2)",
    "Tools": "var(--onit-data-3)",
    "Vehicle": "var(--onit-data-4)",
    "Other": "var(--onit-data-5)"
  },
  "sound": {
    "placeholder": true,
    "music": {
      "bpm": 90,
      "bars": 12,
      "db": -24,
      "fadeIn": 1200,
      "fadeOut": 600,
      "duckDb": -4,
      "duckMs": 700
    }
  },
  "slides": {
    "opener": {
      "theme": "dark",
      "heroEnd": "mark.end",
      "hold": 2400,
      "beats": {
        "cols": {
          "delay": 150,
          "dur": 900,
          "stagger": 90,
          "ease": "back"
        },
        "days": {
          "delay": 400,
          "dur": 400,
          "stagger": 40
        },
        "sweep": {
          "delay": "cols.end-400",
          "dur": 1300,
          "ease": "inOut"
        },
        "mark": {
          "delay": "sweep.start+1000",
          "dur": 900,
          "ease": "out"
        },
        "label": {
          "delay": "mark.start+200",
          "dur": 500
        },
        "title": {
          "delay": "mark.start+350",
          "dur": 650
        },
        "range": {
          "delay": "mark.start+600",
          "dur": 500
        },
        "peak": {
          "delay": "mark.start+600",
          "dur": 500
        },
        "aff": {
          "delay": "mark.start+1100",
          "dur": 800
        }
      },
      "cues": [
        {
          "at": "sweep.start",
          "sound": "sweep",
          "db": -18,
          "label": "Ribbon sweep"
        },
        {
          "at": "mark.end",
          "sound": "chime",
          "db": -20,
          "label": "Swoosh settles (soft)"
        }
      ]
    },
    "moneyIn": {
      "theme": "light",
      "heroEnd": "card.end",
      "hold": 2800,
      "beats": {
        "label": {
          "delay": 100,
          "dur": 500
        },
        "lead": {
          "delay": 200,
          "dur": 500
        },
        "count": {
          "delay": 400,
          "dur": 2000,
          "ease": "outQuart"
        },
        "chips": {
          "delay": 500,
          "dur": 650,
          "stagger": 260,
          "ease": "back"
        },
        "pour": {
          "delay": "chips.start+450",
          "dur": 520,
          "stagger": 260,
          "ease": "inOut"
        },
        "segs": {
          "delay": "pour.start+420",
          "dur": 560,
          "stagger": 260,
          "ease": "out"
        },
        "pct": {
          "delay": "segs.start+360",
          "dur": 300,
          "stagger": 260
        },
        "caption": {
          "delay": "count.end-200",
          "dur": 500
        },
        "card": {
          "delay": "count.end+250",
          "dur": 600
        },
        "share": {
          "delay": "card.start+250",
          "dur": 900
        }
      },
      "cues": [
        {
          "at": "pour.each",
          "sound": "drop",
          "db": -24,
          "label": "Pour into bar"
        },
        {
          "at": "count",
          "sound": "ticks",
          "db": -26,
          "count": 14
        },
        {
          "at": "count.end",
          "sound": "chime",
          "db": -12,
          "label": "Total lands"
        }
      ]
    },
    "moneyInZero": {
      "theme": "light",
      "heroEnd": "total.end",
      "hold": 2600,
      "beats": {
        "label": {
          "delay": 100,
          "dur": 500
        },
        "title": {
          "delay": 250,
          "dur": 600
        },
        "body": {
          "delay": 600,
          "dur": 500
        },
        "rows": {
          "delay": 1000,
          "dur": 600,
          "stagger": 240
        },
        "total": {
          "delay": "rows.end+100",
          "dur": 1200,
          "ease": "outQuart"
        }
      },
      "cues": [
        {
          "at": "total",
          "sound": "ticks",
          "db": -28,
          "count": 10
        }
      ]
    },
    "moneyOut": {
      "theme": "dark",
      "heroEnd": "card.end",
      "hold": 2800,
      "beats": {
        "label": {
          "delay": 100,
          "dur": 500
        },
        "lead": {
          "delay": 200,
          "dur": 500
        },
        "count": {
          "delay": 400,
          "dur": 1600,
          "ease": "outQuart"
        },
        "receipts": {
          "delay": 450,
          "dur": 800,
          "stagger": 300,
          "ease": "out"
        },
        "ring": {
          "delay": 1500,
          "dur": 1300,
          "ease": "linear"
        },
        "center": {
          "delay": "ring.end-200",
          "dur": 500
        },
        "legend": {
          "delay": "ring.end",
          "dur": 500
        },
        "card": {
          "delay": "ring.end+300",
          "dur": 600
        },
        "trips": {
          "delay": "card.start+300",
          "dur": 400,
          "stagger": 140
        }
      },
      "cues": [
        {
          "at": "receipts.each",
          "sound": "flutter",
          "db": -22,
          "label": "Receipt"
        },
        {
          "at": "count",
          "sound": "ticks",
          "db": -26,
          "count": 12
        },
        {
          "at": "count.end",
          "sound": "chime",
          "db": -14,
          "label": "Total lands"
        }
      ]
    },
    "kept": {
      "theme": "light",
      "heroEnd": "chip.end",
      "hold": 2600,
      "beats": {
        "label": {
          "delay": 100,
          "dur": 500
        },
        "lead": {
          "delay": 200,
          "dur": 500
        },
        "ring": {
          "delay": 400,
          "dur": 2000,
          "ease": "out"
        },
        "caption": {
          "delay": "ring.end-600",
          "dur": 500
        },
        "chip": {
          "delay": "ring.end+100",
          "dur": 500,
          "ease": "back"
        },
        "foot": {
          "delay": "chip.start+300",
          "dur": 500
        }
      },
      "cues": [
        {
          "at": "ring",
          "sound": "ticks",
          "db": -26,
          "count": 14
        },
        {
          "at": "ring.end",
          "sound": "chime",
          "db": -12,
          "label": "Ring + net land"
        }
      ]
    },
    "keptInvest": {
      "theme": "light",
      "heroEnd": "chip.end",
      "hold": 2600,
      "beats": {
        "label": {
          "delay": 100,
          "dur": 500
        },
        "title": {
          "delay": 250,
          "dur": 600
        },
        "count": {
          "delay": 800,
          "dur": 1400,
          "ease": "outQuart"
        },
        "inBar": {
          "delay": 1000,
          "dur": 900
        },
        "outBars": {
          "delay": 1200,
          "dur": 800,
          "stagger": 200
        },
        "chip": {
          "delay": "outBars.end+200",
          "dur": 500
        }
      },
      "cues": [
        {
          "at": "count",
          "sound": "ticks",
          "db": -28,
          "count": 10
        },
        {
          "at": "count.end",
          "sound": "chime",
          "db": -22,
          "label": "Net lands (soft)"
        }
      ]
    },
    "glance": {
      "theme": "light",
      "heroEnd": "card.end",
      "hold": 2600,
      "beats": {
        "label": {
          "delay": 100,
          "dur": 500
        },
        "title": {
          "delay": 250,
          "dur": 600
        },
        "sub": {
          "delay": 500,
          "dur": 500
        },
        "total": {
          "delay": 500,
          "dur": 1600,
          "ease": "outQuart"
        },
        "bars": {
          "delay": 700,
          "dur": 900,
          "stagger": 200
        },
        "vals": {
          "delay": "bars.start+600",
          "dur": 400,
          "stagger": 200
        },
        "card": {
          "delay": "bars.end+200",
          "dur": 600
        }
      },
      "cues": [
        {
          "at": "total",
          "sound": "ticks",
          "db": -26,
          "count": 12
        },
        {
          "at": "total.end",
          "sound": "chime",
          "db": -12,
          "label": "Month total lands"
        }
      ]
    },
    "owed": {
      "theme": "dark",
      "heroEnd": "lines.end",
      "hold": 3000,
      "beats": {
        "label": {
          "delay": 100,
          "dur": 500
        },
        "lead": {
          "delay": 200,
          "dur": 500
        },
        "count": {
          "delay": 400,
          "dur": 1600,
          "ease": "outQuart"
        },
        "countcap": {
          "delay": "count.end-300",
          "dur": 500
        },
        "cards": {
          "delay": 900,
          "dur": 650,
          "stagger": 200,
          "ease": "back"
        },
        "edges": {
          "delay": "cards.end-250",
          "dur": 400,
          "stagger": 50
        },
        "more": {
          "delay": "edges.end+50",
          "dur": 400,
          "ease": "back"
        },
        "lines": {
          "delay": "more.end+100",
          "dur": 500
        },
        "cta": {
          "delay": "lines.start+400",
          "dur": 500
        },
        "closing": {
          "delay": "cta.start+400",
          "dur": 500
        }
      },
      "cues": [
        {
          "at": "count",
          "sound": "ticks",
          "db": -26,
          "count": 12
        },
        {
          "at": "count.end",
          "sound": "chime",
          "db": -12,
          "label": "Total lands"
        }
      ]
    },
    "caughtUp": {
      "theme": "dark",
      "heroEnd": "glint.end",
      "hold": 2400,
      "beats": {
        "label": {
          "delay": 100,
          "dur": 500
        },
        "caption": {
          "delay": 250,
          "dur": 500
        },
        "edges": {
          "delay": 100,
          "dur": 400,
          "stagger": 40
        },
        "cards": {
          "delay": 100,
          "dur": 450,
          "stagger": 120,
          "ease": "out"
        },
        "stamp": {
          "delay": 560,
          "dur": 170,
          "stagger": 330,
          "ease": "back"
        },
        "ripple": {
          "delay": "stamp.end+100",
          "dur": 200,
          "stagger": 40
        },
        "square": {
          "delay": "ripple.end+40",
          "dur": 360,
          "ease": "inOut"
        },
        "band": {
          "delay": "square.end",
          "dur": 340,
          "ease": "snap"
        },
        "mark": {
          "delay": "band.end-120",
          "dur": 340,
          "ease": "back"
        },
        "glint": {
          "delay": "band.end",
          "dur": 500,
          "ease": "out"
        },
        "more": {
          "delay": "ripple.end",
          "dur": 400,
          "ease": "back"
        },
        "title": {
          "delay": "band.end+100",
          "dur": 600
        },
        "body": {
          "delay": "band.end+300",
          "dur": 500
        },
        "cta": {
          "delay": "band.end+550",
          "dur": 500
        },
        "closing": {
          "delay": "band.end+800",
          "dur": 500
        }
      },
      "cues": [
        {
          "at": "stamp.each",
          "sound": "stamp",
          "db": -14,
          "label": "PAID"
        },
        {
          "at": "ripple.start",
          "sound": "ripple",
          "db": -20,
          "label": "Edge ripple"
        },
        {
          "at": "band.end",
          "sound": "snap",
          "db": -10,
          "label": "Band snaps on"
        },
        {
          "at": "glint.start",
          "sound": "glint",
          "db": -24,
          "label": "Glint"
        }
      ]
    },
    "quiet": {
      "theme": "light",
      "heroEnd": "card.end",
      "hold": 3000,
      "beats": {
        "card": {
          "delay": 150,
          "dur": 700
        }
      },
      "cues": []
    }
  }
}
```

## 11. Scenario data (verbatim, `OnItRecap.SCENARIOS`)

Weekly: normalWeek, quietWeek ($0 in), investmentWeek, caughtUp, nothing. Monthly: busyMonth, quietMonth, spikyMonth.

```json
{
 "normalWeek": {
  "id": "normal-week",
  "period": "week",
  "periodLabel": "Sep 22 – Sep 28",
  "monthName": null,
  "notifyDate": "Tuesday, September 29",
  "income": {
   "total": 1850,
   "payments": 4,
   "clients": 3
  },
  "spend": {
   "total": 214,
   "categories": [
    {
     "name": "Supplies",
     "amount": 154
    },
    {
     "name": "Fuel",
     "amount": 38
    },
    {
     "name": "Tools",
     "amount": 22
    }
   ],
   "receipts": [
    {
     "vendor": "Home Depot",
     "amount": 58,
     "category": "Supplies"
    },
    {
     "vendor": "Shell",
     "amount": 38,
     "category": "Fuel"
    },
    {
     "vendor": "Ace Hardware",
     "amount": 22,
     "category": "Tools"
    }
   ]
  },
  "net": 1636,
  "change": {
   "net": {
    "pct": 18,
    "direction": "up",
    "vs": "last week"
   }
  },
  "daily": [
   0,
   450,
   0,
   800,
   400,
   0,
   200
  ],
  "dayLabels": [
   "T",
   "W",
   "T",
   "F",
   "S",
   "S",
   "M"
  ],
  "topClient": {
   "name": "Mike Davis",
   "amount": 1250
  },
  "topVendor": {
   "name": "Home Depot",
   "amount": 132,
   "category": "Supplies",
   "trips": [
    58,
    46,
    28
   ]
  },
  "paymentMethods": [
   {
    "method": "zelle",
    "amount": 1000
   },
   {
    "method": "card",
    "amount": 450
   },
   {
    "method": "cashapp",
    "amount": 400
   }
  ],
  "owed": {
   "total": 2400,
   "invoices": [
    {
     "id": "INV-1060",
     "client": "Sarah Lee",
     "amount": 1200,
     "status": "viewed",
     "date": "2026-09-28"
    },
    {
     "id": "INV-1059",
     "client": "James Ortiz",
     "amount": 800,
     "status": "viewed",
     "date": "2026-09-27"
    },
    {
     "id": "INV-1058",
     "client": "Tom Reyes",
     "amount": 400,
     "status": "sent",
     "date": "2026-09-26"
    }
   ]
  },
  "viewedUnpaid": 2,
  "quotesPending": 1,
  "paidInvoices": [
   {
    "id": "INV-1038",
    "client": "Mike Davis",
    "amount": 800,
    "status": "paid",
    "date": "2026-09-25"
   },
   {
    "id": "INV-1036",
    "client": "Mike Davis",
    "amount": 450,
    "status": "paid",
    "date": "2026-09-23"
   },
   {
    "id": "INV-1039",
    "client": "Sarah Lee",
    "amount": 400,
    "status": "paid",
    "date": "2026-09-26"
   },
   {
    "id": "INV-1041",
    "client": "Tom Reyes",
    "amount": 200,
    "status": "paid",
    "date": "2026-09-28"
   }
  ],
  "weeks": null
 },
 "quietWeek": {
  "id": "quiet-week",
  "period": "week",
  "periodLabel": "Sep 22 – Sep 28",
  "monthName": null,
  "notifyDate": "Tuesday, September 29",
  "income": {
   "total": 0,
   "payments": 0,
   "clients": 0
  },
  "spend": {
   "total": 86,
   "categories": [
    {
     "name": "Supplies",
     "amount": 64
    },
    {
     "name": "Fuel",
     "amount": 22
    }
   ],
   "receipts": [
    {
     "vendor": "Home Depot",
     "amount": 64,
     "category": "Supplies"
    },
    {
     "vendor": "Shell",
     "amount": 22,
     "category": "Fuel"
    }
   ]
  },
  "net": -86,
  "change": {
   "net": {
    "pct": 100,
    "direction": "down",
    "vs": "last week"
   }
  },
  "daily": [
   0,
   0,
   0,
   0,
   0,
   0,
   0
  ],
  "dayLabels": [
   "T",
   "W",
   "T",
   "F",
   "S",
   "S",
   "M"
  ],
  "topClient": null,
  "topVendor": {
   "name": "Home Depot",
   "amount": 64,
   "category": "Supplies",
   "trips": [
    40,
    24
   ]
  },
  "paymentMethods": [],
  "owed": {
   "total": 2400,
   "invoices": [
    {
     "id": "INV-1060",
     "client": "Sarah Lee",
     "amount": 1200,
     "status": "viewed",
     "date": "2026-09-28"
    },
    {
     "id": "INV-1059",
     "client": "James Ortiz",
     "amount": 800,
     "status": "viewed",
     "date": "2026-09-27"
    },
    {
     "id": "INV-1058",
     "client": "Tom Reyes",
     "amount": 400,
     "status": "sent",
     "date": "2026-09-26"
    }
   ]
  },
  "viewedUnpaid": 2,
  "quotesPending": 1,
  "paidInvoices": [],
  "weeks": null
 },
 "investmentWeek": {
  "id": "investment-week",
  "period": "week",
  "periodLabel": "Sep 22 – Sep 28",
  "monthName": null,
  "notifyDate": "Tuesday, September 29",
  "income": {
   "total": 640,
   "payments": 2,
   "clients": 2
  },
  "spend": {
   "total": 1120,
   "categories": [
    {
     "name": "Tools",
     "amount": 780
    },
    {
     "name": "Supplies",
     "amount": 280
    },
    {
     "name": "Fuel",
     "amount": 60
    }
   ],
   "receipts": [
    {
     "vendor": "Lowe's",
     "amount": 780,
     "category": "Tools"
    },
    {
     "vendor": "Home Depot",
     "amount": 280,
     "category": "Supplies"
    },
    {
     "vendor": "Shell",
     "amount": 60,
     "category": "Fuel"
    }
   ]
  },
  "net": -480,
  "change": {
   "net": {
    "pct": 38,
    "direction": "down",
    "vs": "last week"
   }
  },
  "daily": [
   0,
   0,
   400,
   0,
   0,
   240,
   0
  ],
  "dayLabels": [
   "T",
   "W",
   "T",
   "F",
   "S",
   "S",
   "M"
  ],
  "topClient": {
   "name": "Sarah Lee",
   "amount": 400
  },
  "topVendor": {
   "name": "Lowe's",
   "amount": 780,
   "category": "Tools",
   "trips": [
    780
   ]
  },
  "paymentMethods": [
   {
    "method": "card",
    "amount": 400
   },
   {
    "method": "zelle",
    "amount": 240
   }
  ],
  "owed": {
   "total": 2400,
   "invoices": [
    {
     "id": "INV-1060",
     "client": "Sarah Lee",
     "amount": 1200,
     "status": "viewed",
     "date": "2026-09-28"
    },
    {
     "id": "INV-1059",
     "client": "James Ortiz",
     "amount": 800,
     "status": "viewed",
     "date": "2026-09-27"
    },
    {
     "id": "INV-1058",
     "client": "Tom Reyes",
     "amount": 400,
     "status": "sent",
     "date": "2026-09-26"
    }
   ]
  },
  "viewedUnpaid": 2,
  "quotesPending": 1,
  "paidInvoices": [
   {
    "id": "INV-1038",
    "client": "Mike Davis",
    "amount": 800,
    "status": "paid",
    "date": "2026-09-25"
   },
   {
    "id": "INV-1036",
    "client": "Mike Davis",
    "amount": 450,
    "status": "paid",
    "date": "2026-09-23"
   },
   {
    "id": "INV-1039",
    "client": "Sarah Lee",
    "amount": 400,
    "status": "paid",
    "date": "2026-09-26"
   },
   {
    "id": "INV-1041",
    "client": "Tom Reyes",
    "amount": 200,
    "status": "paid",
    "date": "2026-09-28"
   }
  ],
  "weeks": null
 },
 "caughtUp": {
  "id": "caught-up",
  "period": "week",
  "periodLabel": "Sep 22 – Sep 28",
  "monthName": null,
  "notifyDate": "Tuesday, September 29",
  "income": {
   "total": 1850,
   "payments": 4,
   "clients": 3
  },
  "spend": {
   "total": 214,
   "categories": [
    {
     "name": "Supplies",
     "amount": 154
    },
    {
     "name": "Fuel",
     "amount": 38
    },
    {
     "name": "Tools",
     "amount": 22
    }
   ],
   "receipts": [
    {
     "vendor": "Home Depot",
     "amount": 58,
     "category": "Supplies"
    },
    {
     "vendor": "Shell",
     "amount": 38,
     "category": "Fuel"
    },
    {
     "vendor": "Ace Hardware",
     "amount": 22,
     "category": "Tools"
    }
   ]
  },
  "net": 1636,
  "change": {
   "net": {
    "pct": 18,
    "direction": "up",
    "vs": "last week"
   }
  },
  "daily": [
   0,
   450,
   0,
   800,
   400,
   0,
   200
  ],
  "dayLabels": [
   "T",
   "W",
   "T",
   "F",
   "S",
   "S",
   "M"
  ],
  "topClient": {
   "name": "Mike Davis",
   "amount": 1250
  },
  "topVendor": {
   "name": "Home Depot",
   "amount": 132,
   "category": "Supplies",
   "trips": [
    58,
    46,
    28
   ]
  },
  "paymentMethods": [
   {
    "method": "zelle",
    "amount": 1000
   },
   {
    "method": "card",
    "amount": 450
   },
   {
    "method": "cashapp",
    "amount": 400
   }
  ],
  "owed": {
   "total": 0,
   "invoices": []
  },
  "viewedUnpaid": 0,
  "quotesPending": 0,
  "paidInvoices": [
   {
    "id": "INV-1038",
    "client": "Mike Davis",
    "amount": 800,
    "status": "paid",
    "date": "2026-09-25"
   },
   {
    "id": "INV-1036",
    "client": "Mike Davis",
    "amount": 450,
    "status": "paid",
    "date": "2026-09-23"
   },
   {
    "id": "INV-1039",
    "client": "Sarah Lee",
    "amount": 400,
    "status": "paid",
    "date": "2026-09-26"
   },
   {
    "id": "INV-1041",
    "client": "Tom Reyes",
    "amount": 200,
    "status": "paid",
    "date": "2026-09-28"
   }
  ],
  "weeks": null
 },
 "nothing": {
  "id": "nothing",
  "period": "week",
  "periodLabel": "Sep 22 – Sep 28",
  "monthName": null,
  "notifyDate": "Tuesday, September 29",
  "income": {
   "total": 0,
   "payments": 0,
   "clients": 0
  },
  "spend": {
   "total": 0,
   "categories": [],
   "receipts": []
  },
  "net": 0,
  "change": {
   "net": {
    "pct": 0,
    "direction": "flat",
    "vs": "last week"
   }
  },
  "daily": [
   0,
   0,
   0,
   0,
   0,
   0,
   0
  ],
  "dayLabels": [
   "T",
   "W",
   "T",
   "F",
   "S",
   "S",
   "M"
  ],
  "topClient": null,
  "topVendor": null,
  "paymentMethods": [],
  "owed": {
   "total": 0,
   "invoices": []
  },
  "viewedUnpaid": 0,
  "quotesPending": 0,
  "paidInvoices": [],
  "weeks": null
 },
 "busyMonth": {
  "id": "busy-month",
  "period": "month",
  "periodLabel": "Sep 1 – Sep 30",
  "monthName": "September",
  "notifyDate": "Thursday, October 1",
  "income": {
   "total": 7420,
   "payments": 17,
   "clients": 9
  },
  "spend": {
   "total": 860,
   "categories": [
    {
     "name": "Supplies",
     "amount": 520
    },
    {
     "name": "Fuel",
     "amount": 210
    },
    {
     "name": "Tools",
     "amount": 130
    }
   ],
   "receipts": [
    {
     "vendor": "Home Depot",
     "amount": 62,
     "category": "Supplies"
    },
    {
     "vendor": "Shell",
     "amount": 48,
     "category": "Fuel"
    },
    {
     "vendor": "Lowe's",
     "amount": 130,
     "category": "Tools"
    }
   ]
  },
  "net": 6560,
  "change": {
   "net": {
    "pct": 9,
    "direction": "up",
    "vs": "August"
   }
  },
  "daily": [
   0,
   320,
   0,
   560,
   0,
   600,
   0,
   450,
   0,
   390,
   0,
   700,
   250,
   0,
   0,
   800,
   0,
   650,
   450,
   400,
   0,
   0,
   450,
   0,
   800,
   400,
   0,
   200,
   0,
   0
  ],
  "topClient": {
   "name": "Mike Davis",
   "amount": 3150
  },
  "topVendor": {
   "name": "Home Depot",
   "amount": 410,
   "category": "Supplies",
   "trips": [
    62,
    48,
    55,
    40,
    38,
    52,
    44,
    36,
    35
   ]
  },
  "paymentMethods": [
   {
    "method": "zelle",
    "amount": 3560
   },
   {
    "method": "card",
    "amount": 2450
   },
   {
    "method": "cashapp",
    "amount": 1410
   }
  ],
  "owed": {
   "total": 2400,
   "invoices": [
    {
     "id": "INV-1060",
     "client": "Sarah Lee",
     "amount": 1200,
     "status": "viewed",
     "date": "2026-09-28"
    },
    {
     "id": "INV-1059",
     "client": "James Ortiz",
     "amount": 800,
     "status": "viewed",
     "date": "2026-09-27"
    },
    {
     "id": "INV-1058",
     "client": "Tom Reyes",
     "amount": 400,
     "status": "sent",
     "date": "2026-09-26"
    }
   ]
  },
  "viewedUnpaid": 2,
  "quotesPending": 1,
  "paidInvoices": [
   {
    "id": "INV-1038",
    "client": "Mike Davis",
    "amount": 800,
    "status": "paid",
    "date": "2026-09-25"
   },
   {
    "id": "INV-1036",
    "client": "Mike Davis",
    "amount": 450,
    "status": "paid",
    "date": "2026-09-23"
   },
   {
    "id": "INV-1039",
    "client": "Sarah Lee",
    "amount": 400,
    "status": "paid",
    "date": "2026-09-26"
   },
   {
    "id": "INV-1041",
    "client": "Tom Reyes",
    "amount": 200,
    "status": "paid",
    "date": "2026-09-28"
   }
  ],
  "weeks": [
   {
    "label": "Sep 1–7",
    "amount": 1480
   },
   {
    "label": "Sep 8–14",
    "amount": 1790
   },
   {
    "label": "Sep 15–21",
    "amount": 2300
   },
   {
    "label": "Sep 22–30",
    "amount": 1850
   }
  ]
 },
 "quietMonth": {
  "id": "quiet-month",
  "period": "month",
  "periodLabel": "Sep 1 – Sep 30",
  "monthName": "September",
  "notifyDate": "Thursday, October 1",
  "income": {
   "total": 1090,
   "payments": 5,
   "clients": 4
  },
  "spend": {
   "total": 310,
   "categories": [
    {
     "name": "Supplies",
     "amount": 180
    },
    {
     "name": "Fuel",
     "amount": 130
    }
   ],
   "receipts": [
    {
     "vendor": "Home Depot",
     "amount": 70,
     "category": "Supplies"
    },
    {
     "vendor": "Shell",
     "amount": 45,
     "category": "Fuel"
    },
    {
     "vendor": "Home Depot",
     "amount": 60,
     "category": "Supplies"
    }
   ]
  },
  "net": 780,
  "change": {
   "net": {
    "pct": 22,
    "direction": "down",
    "vs": "August"
   }
  },
  "daily": [
   0,
   0,
   180,
   0,
   0,
   0,
   0,
   0,
   240,
   0,
   0,
   0,
   0,
   0,
   0,
   150,
   0,
   0,
   0,
   0,
   0,
   320,
   0,
   0,
   0,
   0,
   0,
   0,
   200,
   0
  ],
  "topClient": {
   "name": "Sarah Lee",
   "amount": 320
  },
  "topVendor": {
   "name": "Home Depot",
   "amount": 180,
   "category": "Supplies",
   "trips": [
    70,
    60,
    50
   ]
  },
  "paymentMethods": [
   {
    "method": "zelle",
    "amount": 520
   },
   {
    "method": "card",
    "amount": 360
   },
   {
    "method": "cashapp",
    "amount": 210
   }
  ],
  "owed": {
   "total": 2400,
   "invoices": [
    {
     "id": "INV-1060",
     "client": "Sarah Lee",
     "amount": 1200,
     "status": "viewed",
     "date": "2026-09-28"
    },
    {
     "id": "INV-1059",
     "client": "James Ortiz",
     "amount": 800,
     "status": "viewed",
     "date": "2026-09-27"
    },
    {
     "id": "INV-1058",
     "client": "Tom Reyes",
     "amount": 400,
     "status": "sent",
     "date": "2026-09-26"
    }
   ]
  },
  "viewedUnpaid": 2,
  "quotesPending": 1,
  "paidInvoices": [
   {
    "id": "INV-1038",
    "client": "Mike Davis",
    "amount": 800,
    "status": "paid",
    "date": "2026-09-25"
   },
   {
    "id": "INV-1036",
    "client": "Mike Davis",
    "amount": 450,
    "status": "paid",
    "date": "2026-09-23"
   },
   {
    "id": "INV-1039",
    "client": "Sarah Lee",
    "amount": 400,
    "status": "paid",
    "date": "2026-09-26"
   },
   {
    "id": "INV-1041",
    "client": "Tom Reyes",
    "amount": 200,
    "status": "paid",
    "date": "2026-09-28"
   }
  ],
  "weeks": [
   {
    "label": "Sep 1–7",
    "amount": 180
   },
   {
    "label": "Sep 8–14",
    "amount": 240
   },
   {
    "label": "Sep 15–21",
    "amount": 150
   },
   {
    "label": "Sep 22–30",
    "amount": 520
   }
  ]
 },
 "spikyMonth": {
  "id": "spiky-month",
  "period": "month",
  "periodLabel": "Sep 1 – Sep 30",
  "monthName": "September",
  "notifyDate": "Thursday, October 1",
  "income": {
   "total": 7730,
   "payments": 6,
   "clients": 4
  },
  "spend": {
   "total": 1240,
   "categories": [
    {
     "name": "Supplies",
     "amount": 640
    },
    {
     "name": "Tools",
     "amount": 420
    },
    {
     "name": "Fuel",
     "amount": 180
    }
   ],
   "receipts": [
    {
     "vendor": "Lowe's",
     "amount": 420,
     "category": "Tools"
    },
    {
     "vendor": "Home Depot",
     "amount": 310,
     "category": "Supplies"
    },
    {
     "vendor": "Shell",
     "amount": 60,
     "category": "Fuel"
    }
   ]
  },
  "net": 6490,
  "change": {
   "net": {
    "pct": 14,
    "direction": "up",
    "vs": "August"
   }
  },
  "daily": [
   0,
   0,
   0,
   0,
   2400,
   0,
   0,
   0,
   0,
   0,
   150,
   0,
   0,
   0,
   0,
   0,
   0,
   3100,
   0,
   0,
   0,
   0,
   0,
   0,
   0,
   180,
   0,
   1900,
   0,
   0
  ],
  "topClient": {
   "name": "Ortiz Builders",
   "amount": 3100
  },
  "topVendor": {
   "name": "Home Depot",
   "amount": 640,
   "category": "Supplies",
   "trips": [
    310,
    190,
    140
   ]
  },
  "paymentMethods": [
   {
    "method": "zelle",
    "amount": 3710
   },
   {
    "method": "card",
    "amount": 2550
   },
   {
    "method": "cashapp",
    "amount": 1470
   }
  ],
  "owed": {
   "total": 2400,
   "invoices": [
    {
     "id": "INV-1060",
     "client": "Sarah Lee",
     "amount": 1200,
     "status": "viewed",
     "date": "2026-09-28"
    },
    {
     "id": "INV-1059",
     "client": "James Ortiz",
     "amount": 800,
     "status": "viewed",
     "date": "2026-09-27"
    },
    {
     "id": "INV-1058",
     "client": "Tom Reyes",
     "amount": 400,
     "status": "sent",
     "date": "2026-09-26"
    }
   ]
  },
  "viewedUnpaid": 2,
  "quotesPending": 1,
  "paidInvoices": [
   {
    "id": "INV-1038",
    "client": "Mike Davis",
    "amount": 800,
    "status": "paid",
    "date": "2026-09-25"
   },
   {
    "id": "INV-1036",
    "client": "Mike Davis",
    "amount": 450,
    "status": "paid",
    "date": "2026-09-23"
   },
   {
    "id": "INV-1039",
    "client": "Sarah Lee",
    "amount": 400,
    "status": "paid",
    "date": "2026-09-26"
   },
   {
    "id": "INV-1041",
    "client": "Tom Reyes",
    "amount": 200,
    "status": "paid",
    "date": "2026-09-28"
   }
  ],
  "weeks": [
   {
    "label": "Sep 1–7",
    "amount": 2400
   },
   {
    "label": "Sep 8–14",
    "amount": 150
   },
   {
    "label": "Sep 15–21",
    "amount": 3100
   },
   {
    "label": "Sep 22–30",
    "amount": 2080
   }
  ]
 }
}
```

## 12. Component CSS (verbatim from the prototype, phone frame / lock screen / test panel removed)

Tokens are the prototype's `--onit-*` names; map them to the app tokens when porting.

```css
/* On It — design tokens (from On It Design System) + recap component styles */
:root{
  --onit-cream:#fff8f0; --onit-ink:#1f1b13; --onit-secondary:#4d4635;
  --onit-gold:#d4af37; --onit-gold-light:#f1d57c; --onit-gold-deep:#b8952a; --onit-gold-text:#735c00;
  --onit-success:#2e6b3f; --onit-success-tint:#e3efe3; --onit-neutral-chip:#efe8dc; --onit-track:#efe6d6;
  --onit-ink-raised:#2a251c; --onit-on-ink-muted:#cfc3ad; --onit-on-ink-body:#e9dfcc;
  --onit-data-1:#d4af37; --onit-data-2:#2f8a83; --onit-data-3:#c0693f; --onit-data-4:#5b77a8; --onit-data-5:#6f8c5c;
  --onit-muted-dot:#a39a86;
  --onit-zelle:#6D1ED4; --onit-cashapp:#00C244; --onit-card:#635BFF;
  --onit-display:Montserrat,system-ui,sans-serif; --onit-body:Inter,system-ui,sans-serif;
  --onit-icons:'Material Symbols Outlined';
}
.rc-root{display:flex;flex-wrap:wrap;gap:40px;align-items:flex-start;font-family:var(--onit-body);color:var(--onit-ink);-webkit-font-smoothing:antialiased}
.rc-root *{box-sizing:border-box}
.rc-ico{font-family:var(--onit-icons);font-weight:400;font-style:normal;line-height:1;letter-spacing:normal;text-transform:none;white-space:nowrap;-webkit-font-feature-settings:'liga';font-feature-settings:'liga'}

/* phone */
.rc-phone{flex:none;padding:12px;border-radius:64px;background:linear-gradient(160deg,#2a2722,#0f0e0c);box-shadow:0 40px 80px -40px rgba(31,27,19,.7),inset 0 0 0 1.5px #4a453c}
.rc-screen{position:relative;width:393px;height:852px;border-radius:52px;overflow:hidden;background:var(--onit-ink);touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
.rc-layer{position:absolute;inset:0}
.rc-slide{position:absolute;inset:0;overflow:hidden;background:var(--onit-cream)}
.rc-slide[data-theme=light]{background:radial-gradient(110% 50% at 50% -4%,#fff,rgba(255,255,255,0) 64%),radial-gradient(120% 50% at 50% 110%,rgba(212,175,55,.10),rgba(212,175,55,0) 60%),var(--onit-cream);color:var(--onit-ink)}
.rc-slide[data-theme=dark]{background:radial-gradient(120% 55% at 50% 108%,rgba(212,175,55,.16),rgba(212,175,55,0) 62%),radial-gradient(90% 40% at 50% -6%,rgba(255,248,240,.06),rgba(255,248,240,0) 70%),var(--onit-ink);color:var(--onit-cream)}
.rc-clock{position:absolute;width:0;height:0;overflow:hidden}

/* chrome */
.rc-chrome{position:absolute;inset:0;pointer-events:none;z-index:20;color:var(--onit-ink)}
.rc-screen[data-theme=dark] .rc-chrome,.rc-screen[data-theme=lock] .rc-chrome{color:var(--onit-cream)}
.rc-status{position:absolute;top:0;left:0;right:0;height:54px;display:flex;align-items:center;justify-content:space-between;padding:4px 30px 0 40px;font:600 16px system-ui,-apple-system,sans-serif}
.rc-status .rc-ico{font-size:18px}
.rc-island{position:absolute;top:11px;left:50%;margin-left:-62px;width:124px;height:36px;border-radius:999px;background:#000}
.rc-home{position:absolute;bottom:8px;left:50%;margin-left:-67px;width:134px;height:5px;border-radius:3px;background:currentColor}
.rc-story-chrome{transition:opacity .2s}
.rc-screen[data-theme=lock] .rc-story-chrome{opacity:0;visibility:hidden}
.rc-segs{position:absolute;top:58px;left:16px;right:16px;display:flex;gap:4px}
.rc-seg{flex:1;height:3px;border-radius:2px;overflow:hidden;background:rgba(127,118,100,.3)}
.rc-seg i{display:block;height:100%;background:currentColor;transform-origin:left center;transform:scaleX(0)}
.rc-seg.done i{transform:none}
.rc-head{position:absolute;top:72px;left:16px;right:12px;height:40px;display:flex;align-items:center;justify-content:space-between}
.rc-head-l{display:flex;align-items:center;gap:8px;font:600 13px var(--onit-body)}
.rc-head-l img{width:26px;height:26px;border-radius:7px;display:block}
.rc-head-r{display:flex;gap:6px}
.rc-iconbtn{pointer-events:auto;width:40px;height:40px;border:0;border-radius:999px;background:rgba(31,27,19,.06);color:inherit;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.rc-screen[data-theme=dark] .rc-iconbtn{background:rgba(255,248,240,.1)}
.rc-iconbtn .rc-ico{font-size:21px}
.rc-paused{position:absolute;top:120px;right:16px;height:26px;padding:0 10px;border-radius:999px;background:rgba(31,27,19,.6);color:var(--onit-cream);font:600 11px var(--onit-body);letter-spacing:.1em;text-transform:uppercase;display:none;align-items:center;gap:4px}
.rc-paused.on{display:flex}
.rc-toast{position:absolute;left:20px;right:20px;top:122px;display:flex;justify-content:center;opacity:0;transition:opacity .2s}
.rc-toast.on{opacity:1}
.rc-toast span{display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:999px;background:var(--onit-cream);color:var(--onit-ink);font:600 14px var(--onit-body);box-shadow:0 12px 30px -10px rgba(0,0,0,.5)}
.rc-wipe{position:absolute;top:300px;left:0;width:340px;height:269px;z-index:15;pointer-events:none;filter:drop-shadow(0 0 24px rgba(212,175,55,.7));opacity:0}
.rc-wipeband{position:absolute;top:0;bottom:0;left:0;width:140px;z-index:14;pointer-events:none;background:linear-gradient(90deg,rgba(212,175,55,0),rgba(240,205,110,.45) 50%,rgba(212,175,55,0));mix-blend-mode:screen;opacity:0}

/* type + layout */
.rc-content{position:absolute;left:28px;right:28px;top:136px;bottom:40px;display:flex;flex-direction:column}
.rc-spacer{flex:1}
.rc-label{font:600 12px/1 var(--onit-body);letter-spacing:.12em;text-transform:uppercase;color:var(--onit-gold-text)}
[data-theme=dark] .rc-label{color:var(--onit-on-ink-muted)}
.rc-lead{margin-top:18px;font:700 22px/28px var(--onit-display)}
.rc-hero{margin-top:6px;font:800 88px/92px var(--onit-display);letter-spacing:-.03em;font-variant-numeric:tabular-nums;white-space:nowrap}
.rc-cap{margin-top:6px;font:500 15px/20px var(--onit-body);color:var(--onit-secondary)}
[data-theme=dark] .rc-cap{color:var(--onit-on-ink-body)}
.rc-h2{margin:18px 0 0;font:800 36px/40px var(--onit-display);letter-spacing:-.015em;text-wrap:balance}
.rc-body{margin:14px 0 0;font:400 17px/25px var(--onit-body);color:var(--onit-secondary);text-wrap:pretty}
[data-theme=dark] .rc-body{color:var(--onit-on-ink-body)}
.rc-card{padding:18px 20px;border-radius:20px;background:#fff;border:1px solid rgba(31,27,19,.08);box-shadow:0 18px 36px -24px rgba(115,92,0,.45)}
.rc-card-dark{border-radius:20px;background:linear-gradient(180deg,#2c271d,#25211a);border:1px solid rgba(255,248,240,.08);box-shadow:0 20px 40px -24px rgba(0,0,0,.8)}
.rc-t17{font:700 17px/22px var(--onit-display);text-wrap:pretty}
.rc-chip{height:40px;padding:0 16px;border-radius:999px;font:600 15px var(--onit-body);display:inline-flex;align-items:center;gap:6px}
.rc-chip.up{background:var(--onit-success-tint);color:var(--onit-success)}
.rc-chip.flat{background:var(--onit-neutral-chip);color:var(--onit-secondary)}
.rc-chip .rc-ico{font-size:20px}
.rc-btn{width:100%;height:52px;border:0;border-radius:999px;background:linear-gradient(180deg,#dcb94a,var(--onit-gold) 50%,#c9a42c);color:var(--onit-ink);font:700 16px var(--onit-display);cursor:pointer;box-shadow:0 10px 24px -10px rgba(212,175,55,.6),inset 0 1px 0 rgba(255,255,255,.35)}
.rc-btn:active{transform:scale(.97)}
.rc-link{height:44px;border:0;background:transparent;color:var(--onit-cream);font:600 15px var(--onit-body);text-decoration:underline;text-underline-offset:4px;text-decoration-color:rgba(255,248,240,.4);cursor:pointer}
.rc-bar16{height:16px;border-radius:999px;background:var(--onit-track);overflow:hidden;box-shadow:inset 0 1px 3px rgba(31,27,19,.12);display:flex;gap:2px}
.rc-bar16 i{display:block;height:100%;transform-origin:left center}

/* swoosh (real On It mark, from assets) */
.rc-swoosh{display:block;object-fit:contain;-webkit-user-drag:none;user-select:none}

/* opener */
.rc-horizon{position:absolute;inset:0;overflow:visible}
.rc-haze{position:absolute;width:320px;height:220px;pointer-events:none;background:radial-gradient(closest-side,rgba(240,205,110,.22),rgba(240,205,110,0))}
.rc-rider{position:absolute;left:0;top:0;width:54px;height:43px;offset-rotate:auto;offset-anchor:50% 100%;opacity:0;filter:drop-shadow(0 0 10px rgba(240,205,110,.8))}
.rc-mark-box{position:absolute;left:46px;top:150px;width:300px;height:237px}
.rc-mark{position:absolute;inset:0;opacity:.62;filter:drop-shadow(0 0 22px rgba(212,175,55,.55))}
.rc-opener-text{position:absolute;left:28px;right:28px;top:222px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px}
.rc-opener-text .rc-label{color:var(--onit-on-ink-body)}
.rc-opener-title{margin:0;font:800 42px/46px var(--onit-display);letter-spacing:-.02em;text-wrap:balance;text-shadow:0 2px 20px rgba(31,27,19,.75)}
.rc-opener-range{font:500 16px/22px var(--onit-body);color:var(--onit-on-ink-body);text-shadow:0 1px 12px rgba(31,27,19,.8)}
.rc-opener-aff{margin:14px 0 0;padding:0 8px;font:700 19px/26px var(--onit-display);text-wrap:balance}

/* money in */
.rc-paychips{margin-top:40px;display:flex;flex-wrap:wrap;gap:6px}
.rc-paychip{height:36px;padding:0 10px 0 4px;border-radius:999px;background:#fff;border:1.5px solid var(--c);display:flex;align-items:center;gap:6px;font:600 12.5px var(--onit-body);box-shadow:0 6px 14px -8px var(--c)}
.rc-paychip b{font-weight:500;color:var(--onit-secondary);font-variant-numeric:tabular-nums}
.rc-paydisc{width:26px;height:26px;border-radius:999px;background:var(--c);flex:none}
.rc-paybar{position:relative;margin-top:14px;height:64px;border-radius:18px;background:var(--onit-track);overflow:hidden;box-shadow:inset 0 2px 6px rgba(31,27,19,.12)}
.rc-payseg{position:absolute;top:0;bottom:0;transform-origin:left center;display:flex;align-items:flex-end;padding:0 0 9px 12px;overflow:hidden;border-right:2px solid var(--onit-cream)}
.rc-drop{position:absolute;left:0;top:0;width:16px;height:16px;border-radius:999px;background:var(--c);box-shadow:0 0 12px var(--c);opacity:0;z-index:4;pointer-events:none}
.rc-payseg span{font:700 13px/1 var(--onit-display);white-space:nowrap}
.rc-sheen{position:absolute;inset:0;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,0) 46%,rgba(0,0,0,.08));pointer-events:none}
.rc-share{margin-top:12px;height:8px;border-radius:999px;background:var(--onit-track);overflow:hidden}
.rc-share i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#e8c766,var(--onit-gold));transform-origin:left center}

/* money out */
.rc-outrow{margin-top:30px;display:flex;align-items:center;gap:16px}
.rc-ringbox{position:relative;width:176px;height:176px;flex:none}
.rc-ringbox::before{content:"";position:absolute;inset:14px;border-radius:999px;background:radial-gradient(circle at 50% 40%,rgba(255,248,240,.06),rgba(0,0,0,.25) 70%);box-shadow:inset 0 2px 10px rgba(0,0,0,.45)}
.rc-ringbox svg{position:absolute;inset:0;transform:rotate(-90deg);overflow:visible}
.rc-ringcenter{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}
.rc-ringcenter span{font:600 11px/1 var(--onit-body);letter-spacing:.12em;text-transform:uppercase;color:var(--onit-on-ink-body)}
.rc-ringcenter b{font:800 30px/32px var(--onit-display)}
.rc-receipts{position:relative;flex:1;height:176px}
.rc-receipt{position:absolute;left:0;right:0;padding:9px 12px 12px;background:linear-gradient(180deg,#fffaf2,#f3eadb);color:var(--onit-ink);display:flex;flex-direction:column;gap:3px;border-radius:6px 6px 0 0;filter:drop-shadow(0 10px 12px rgba(0,0,0,.55));-webkit-mask:radial-gradient(4px at 6px 100%,transparent 98%,#000) 0 0/12px 100% repeat-x;mask:radial-gradient(4px at 6px 100%,transparent 98%,#000) 0 0/12px 100% repeat-x}
.rc-receipt span{display:flex;align-items:center;gap:6px;font:600 11px/14px var(--onit-body);color:var(--onit-secondary)}
.rc-receipt span i{width:7px;height:7px;border-radius:999px;background:var(--c)}
.rc-receipt b{font:800 18px/22px var(--onit-display);font-variant-numeric:tabular-nums}
.rc-legend{margin-top:20px;display:flex;flex-wrap:wrap;gap:8px 16px}
.rc-legend span{display:flex;align-items:center;gap:7px;font:500 13px var(--onit-body);color:var(--onit-on-ink-body)}
.rc-legend i{width:10px;height:10px;border-radius:3px;background:var(--c)}
.rc-legend b{font-weight:600;color:var(--onit-cream)}
.rc-vendor{padding:18px 20px;display:flex;flex-direction:column;gap:12px;font:500 16px/23px var(--onit-body);text-wrap:pretty}
.rc-trips{display:flex;gap:4px;height:8px}
.rc-trips i{display:block;border-radius:999px;transform-origin:left center}
.rc-trips em{flex:1;border-radius:999px;background:rgba(255,248,240,.08)}

/* kept */
.rc-center{align-items:center}
.rc-center>.rc-label,.rc-center>.rc-lead{align-self:stretch}
.rc-keptring{position:relative;width:300px;height:300px;margin-top:40px}
.rc-keptring::before{content:"";position:absolute;inset:36px;border-radius:999px;background:radial-gradient(circle at 50% 35%,#fff,#fbf2e3 70%);box-shadow:0 24px 50px -20px rgba(115,92,0,.35),inset 0 -6px 16px rgba(115,92,0,.08)}
.rc-keptring svg{position:absolute;inset:0;overflow:visible}
.rc-keptin{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.rc-keptnum{font:800 60px/64px var(--onit-display);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.rc-spark{position:absolute;left:0;top:0;width:14px;height:14px;border-radius:999px;background:var(--onit-cream);box-shadow:0 0 10px var(--onit-gold-light),0 0 3px #fff;offset-anchor:50% 50%;offset-rotate:0deg;opacity:0}
.rc-foot{font:500 13px/18px var(--onit-body);color:var(--onit-secondary)}

/* invoices */
.rc-countcap{margin-top:4px;font:700 18px/22px var(--onit-display)}
.rc-stack{position:relative;margin-top:22px}
.rc-rows{position:relative;z-index:2;overflow:hidden}
.rc-row{display:flex;align-items:center;gap:10px;padding:14px 16px;border-top:1px solid rgba(255,248,240,.08)}
.rc-row:first-child{border-top:0}
.rc-row span{flex:1;font:600 15px var(--onit-body)}
.rc-row em{display:flex;align-items:center;gap:6px;font:600 12px var(--onit-body);font-style:normal;color:var(--onit-on-ink-body)}
.rc-row em i{width:8px;height:8px;border-radius:999px;background:var(--c);box-shadow:0 0 8px var(--c)}
.rc-row b{font:700 16px var(--onit-display);font-variant-numeric:tabular-nums;min-width:60px;text-align:right}
.rc-ocard{position:absolute;left:0;right:0;height:60px;border-radius:16px;background:linear-gradient(160deg,#fffbf4,#f0e6d4);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 14px 28px -14px rgba(0,0,0,.8);color:var(--onit-ink);display:flex;align-items:center;gap:12px;padding:0 18px}
.rc-ocard>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.rc-ocard>div b{font:700 15px/20px var(--onit-display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rc-ocard>div span{display:flex;align-items:center;gap:6px;font:500 12px/16px var(--onit-body);color:var(--onit-secondary)}
.rc-ocard>div span i{width:7px;height:7px;border-radius:999px}
.rc-ocard strong{font:800 20px/24px var(--onit-display);letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.rc-oedge{position:absolute;height:60px;border-radius:16px;box-shadow:0 8px 14px -10px rgba(0,0,0,.8)}
.rc-edge{position:absolute;height:40px;border-radius:18px;border:1px solid rgba(255,248,240,.07)}
.rc-more{position:absolute;left:0;right:0;display:flex;justify-content:center}
.rc-more span{height:28px;padding:0 12px;border-radius:999px;background:rgba(255,248,240,.1);color:var(--onit-cream);font:600 13px var(--onit-body);display:flex;align-items:center}
.rc-lines{margin-top:16px;display:flex;flex-direction:column;gap:10px;font:500 15px/21px var(--onit-body);color:var(--onit-on-ink-body)}
.rc-lines div{display:flex;gap:12px;align-items:baseline}
.rc-lines b{font:800 20px/21px var(--onit-display);color:var(--onit-cream);min-width:22px}
.rc-cta{display:flex;flex-direction:column;align-items:center;gap:4px}
.rc-closing{text-align:center;font:500 13px/18px var(--onit-body);color:var(--onit-on-ink-muted)}
.rc-lrow{display:flex;align-items:center;gap:12px;padding:15px 16px;border-radius:18px;background:#fff;border:1px solid rgba(31,27,19,.08);box-shadow:0 12px 24px -20px rgba(31,27,19,.5)}
.rc-lrow span{flex:1;font:600 15px var(--onit-body)}
.rc-lrow em{display:flex;align-items:center;gap:6px;font:600 12px var(--onit-body);font-style:normal;color:var(--onit-secondary)}
.rc-lrow em i{width:8px;height:8px;border-radius:999px;background:var(--c)}
.rc-lrow b{font:700 16px var(--onit-display);font-variant-numeric:tabular-nums;min-width:58px;text-align:right}

/* caught up bundle */
.rc-bundle{position:absolute;left:66px;top:214px;width:260px;height:170px}
.rc-bundle-shadow{position:absolute;left:-30px;right:-30px;bottom:-34px;height:40px;border-radius:999px;background:radial-gradient(closest-side,rgba(0,0,0,.55),rgba(0,0,0,0))}
.rc-pc-outer,.rc-pc-in,.rc-pc-dip,.rc-pc{position:absolute;left:0;top:0;width:260px;height:170px}
.rc-pc{border-radius:14px;background:linear-gradient(160deg,#fffbf4,#f2e8d7);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 14px 30px -14px rgba(0,0,0,.75);color:var(--onit-ink);overflow:hidden}
.rc-pc small{position:absolute;left:18px;top:18px;font:600 10px/1 var(--onit-body);letter-spacing:.14em;text-transform:uppercase;color:var(--onit-secondary)}
.rc-pc span{position:absolute;left:18px;top:36px;font:700 17px/22px var(--onit-display)}
.rc-pc b{position:absolute;left:18px;bottom:16px;font:800 26px/30px var(--onit-display);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.rc-stamp{position:absolute;right:16px;top:14px}
.rc-stamp div{padding:5px 10px 4px;border:2.5px solid var(--onit-success);border-radius:8px;color:var(--onit-success);font:800 17px/1 var(--onit-display);letter-spacing:.14em;transform:rotate(-10deg);opacity:.92}
.rc-pedge{position:absolute;height:170px;border-radius:14px;border-bottom:2px solid var(--onit-success);box-shadow:0 8px 14px -10px rgba(0,0,0,.8)}
.rc-band{position:absolute;left:-10px;right:-10px;height:44px;z-index:20}
.rc-band-bar{position:absolute;inset:0;border-radius:6px;background:linear-gradient(180deg,#f1d57c 0%,var(--onit-gold) 42%,var(--onit-gold-deep) 100%);box-shadow:0 10px 18px -8px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.45),inset 0 -2px 0 rgba(115,92,0,.35);overflow:hidden}
.rc-glint{position:absolute;top:-10px;bottom:-10px;left:0;width:70px;opacity:0;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.75),rgba(255,255,255,0))}
.rc-band-mark{position:absolute;left:50%;top:50%;width:40px;height:32px;margin:-16px 0 0 -20px}
.rc-pmore{position:absolute;left:0;right:0;display:flex;justify-content:center}
.rc-pmore span{height:30px;padding:0 12px;border-radius:999px;display:flex;align-items:center;font:600 13px var(--onit-body);background:var(--onit-success-tint);color:var(--onit-success)}

/* glance */
.rc-gbars{margin-top:36px;height:300px;display:flex;align-items:flex-end;justify-content:space-between;gap:14px;border-bottom:1px solid rgba(31,27,19,.12)}
.rc-gcol{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:8px}
.rc-gcol b{font:700 14px var(--onit-display);font-variant-numeric:tabular-nums}
.rc-gbar{width:100%;border-radius:14px 14px 4px 4px;transform-origin:bottom center;background:linear-gradient(180deg,#efe4cf,#e3d5bb);box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
.rc-gbar.best{background:linear-gradient(180deg,#f1d57c,var(--onit-gold) 40%,#c49b22);box-shadow:0 -6px 24px rgba(212,175,55,.45),inset 0 1px 0 rgba(255,255,255,.5)}
.rc-glbl{margin-top:10px;display:flex;justify-content:space-between;gap:14px}
.rc-glbl span{flex:1;text-align:center;font:500 12px/16px var(--onit-body);color:var(--onit-secondary)}
.rc-best{display:flex;flex-direction:column;gap:4px;padding:16px 20px;border-radius:20px;background:#fff;border:2px solid var(--onit-gold);box-shadow:0 0 0 4px rgba(212,175,55,.22),0 18px 36px -24px rgba(115,92,0,.5)}
.rc-best small{font:600 12px/1 var(--onit-body);letter-spacing:.12em;text-transform:uppercase;color:var(--onit-gold-text)}
.rc-best b{font:700 18px/24px var(--onit-display)}

/* quiet */
.rc-quiet{position:absolute;left:28px;right:28px;top:136px;bottom:40px;display:flex;align-items:center;justify-content:center;text-align:center}
.rc-quiet-card{width:337px;display:flex;flex-direction:column;align-items:center;padding:40px 28px 28px;border-radius:28px;background:#fff;border:1px solid rgba(31,27,19,.08);box-shadow:0 30px 60px -36px rgba(115,92,0,.5)}
.rc-quiet-card img{width:72px;height:72px;border-radius:17px;display:block;box-shadow:0 12px 24px -10px rgba(115,92,0,.6)}
.rc-quiet-card .rc-btn{margin-top:32px}
```
