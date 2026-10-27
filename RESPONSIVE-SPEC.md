# Responsive pass — phone, tablet, laptop

Branch: `feat/responsive` (off `main`, after `feat/paywall-mockup-v2` and the tutorials branch merge).
Targets: 390 (iPhone), 768 (iPad Mini portrait), 1032 (iPad Pro 13 portrait), 1440 (laptop).
Rule: phone behavior must not change. Every change is tablet/desktop-only unless noted.
One commit per item below. Preview-test only (no localhost).

## Decisions (founder, 2026-10-26)
- Tablet portrait (768–1023): **icon rail** sidebar; full labels from 1024 up.
- Order: paywall + tutorials ship first, then this pass.

## Audit (2026-10-26, read-only)
1. Breakpoints are viewport-based. `AppShell` sidebar is `md:w-64 lg:w-72` (256–288px), so an iPad Mini gets ~512px of content; Books' 3-column grid starts at `lg` (1024) and squashes the Net card.
2. `InstallBanner` is a mobile full-width row reused in the sidebar (`AppShell` aside footer) and wraps one word per line.
3. Only ~35 `md:`/`lg:` classes in `src/`; no tablet layout for Settings, invoice detail, estimates, onboarding.
4. Pay page (`app/pay/[token]`) is `max-w-lg` only; customers open it on laptops.
5. 15 `fixed inset-0 ... items-end` bottom sheets stay glued to the bottom on wide screens (paywall already fixed: card at `md`+).
6. Chat message list has no max width at `md`+ (long lines on laptop).
7. Content widths are inconsistent: Books/Invoices `max-w-6xl`, Clients `5xl`, Settings `4xl`, Chat none.

## Items (in order)
1. **Shell**: sidebar → icon rail at `md`, labels at `lg`; "How it works" moves into the rail; sidebar-specific Install card. Bottom tab bar stays `md:hidden`.
2. **Containers**: one shared page-width wrapper per tab; Books grid driven by container width (`@container`) not viewport.
3. **Sheets**: one shared sheet pattern, bottom sheet on phone, centered dialog (`md`+); migrate the 15 sheets.
4. **Screens**, in this order: pay page → Books → Invoices + Clients → Settings → invoice + estimate detail → chat column width → onboarding + login.
5. **Verify**: preview at 390 / 768 / 1032 / 1440, before/after screenshots, phone diff = none.

## Out of scope
New features, redesigns, landscape-phone tuning, native iPad multitasking.
