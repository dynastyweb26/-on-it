repo: dynastyweb26/-on-it
branch: main
path: src/components/recap

## Last sync
date: 2026-11-15T16:58:59Z

### Updated in this project
- Recap story redesigned as light-only slides with 10-slide order
- New slides: invoices and estimates, top client, bank activity, waiting for you, free-plan final, affirmation
- Tokens, chrome and type lifted from recap.css; swoosh and app icon copied

## Screen map
| Project screen | Repo files |
| --- | --- |
| RecapPlayer.dc.html (chrome, transition) | src/components/recap/RecapStory.tsx, src/components/recap/recap.css, src/components/recap/anim.ts |
| RecapPlayer.dc.html (overview) | src/components/recap/slides/OpenerSlide.tsx |
| RecapPlayer.dc.html (money in) | src/components/recap/slides/MoneyInSlide.tsx, MoneyInZeroSlide.tsx |
| RecapPlayer.dc.html (money out) | src/components/recap/slides/MoneyOutSlide.tsx |
| RecapPlayer.dc.html (kept) | src/components/recap/slides/KeptSlide.tsx, KeptInvestSlide.tsx |
| RecapPlayer.dc.html (invoices and estimates) | src/components/recap/slides/OwedSlide.tsx, CaughtUpSlide.tsx |
| RecapPlayer.dc.html (free plan) | src/lib/recap/quota.ts |
| On It Recap Redesign.dc.html | board of RecapPlayer states; sample data from src/lib/recap/fixtures.ts |
