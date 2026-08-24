'use client';
/* ═══ Tutorial slides — the one shared source of truth ═══
   Slides are data, independent of the surface that shows them. Both surfaces
   read from SLIDES:
     • the first-run carousel picks its four by id (FirstRunTutorial)
     • the reference doc groups them by `tab` (TutorialReference)
   A slide that belongs to neither surface does not belong here.

   Tabs read as three coherent stories:
     Invoices — the full create-to-paid flow: talk/type → read-back → change →
                send → mark paid.
     Chat     — the things you do by talking that aren't the invoice flow:
                snap a receipt, say what you spent.
     Books    — where the money adds up: expenses land, totals, the tax PDF.

   Array order is the in-tab order (slidesForTab preserves it). Each slide's
   `mock` is built only from the token-based primitives in ./mocks (no hardcoded
   hex). Every Expenses/Tax slide passes active="books" to MockShell so the mock
   tab bar shows Books highlighted — the user sees where in the app it lives. */
import Icon from '@/components/Icon';
import { MockShell, MockBubble, MockComposer, MiniStat } from '@/components/tutorial/mocks';

// A slide's home tab, matching app nav. Drives the reference doc's grouping.
// (Settings is intentionally not a tab here — the reference doc covers Chat,
// Invoices, and Books only.)
export type SlideTab = 'chat' | 'invoices' | 'books';

export interface Slide {
  id: string;
  tab: SlideTab;
  headline: string;
  body: string;
  mock: React.ReactNode;
  // id of the [data-spotlight] element inside `mock` the gold ring highlights.
  spotlight: string;
}

export const SLIDES: Slide[] = [
  // ── Invoices: the full create-to-paid flow ──────────────────────
  {
    id: 'mic',
    tab: 'invoices',
    headline: 'Talk or type the job',
    body: "Tap the mic and talk, or type it — “Invoice Cyril four fifty for a door install.” On It writes it up.",
    spotlight: 'mic',
    mock: (
      <MockShell active="chat">
        <div className="space-y-2">
          <MockBubble role="assistant">Tell me about the job — who it&apos;s for and what you did.</MockBubble>
          <MockBubble role="user">Invoice Cyril four fifty for a door install.</MockBubble>
        </div>
        <MockComposer micId="mic" />
      </MockShell>
    ),
  },
  {
    id: 'readback',
    tab: 'invoices',
    headline: 'On It reads it back to you',
    body: 'It repeats the name, the amount, and the work — so you catch a wrong number before it goes out.',
    spotlight: 'readback',
    mock: (
      <MockShell active="chat">
        <div className="space-y-2">
          <MockBubble role="user">Invoice Cyril four fifty for a door install.</MockBubble>
          <div data-spotlight="readback">
            <MockBubble role="assistant">Got it — invoice for Cyril, $450.00 for a door install. Want to send it?</MockBubble>
          </div>
        </div>
      </MockShell>
    ),
  },
  {
    id: 'draft',
    tab: 'invoices',
    headline: 'Check the card, change anything',
    body: 'Every invoice comes up as a draft first. Fix a price, change a name, add a line. Nothing sends until you say so.',
    spotlight: 'lineitems',
    mock: (
      <MockShell active="chat">
        <div className="card border-primary-container/50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Icon name="description" size={14} /> Invoice for Cyril
          </div>
          <div data-spotlight="lineitems">
            <div className="flex justify-between py-0.5 text-[13px]"><span>Door install</span><span className="font-display font-bold">$400.00</span></div>
            <div className="flex justify-between py-0.5 text-[13px]"><span>Hardware</span><span className="font-display font-bold">$35.00</span></div>
            <div className="flex justify-between py-0.5 text-[13px]"><span>Haul-away</span><span className="font-display font-bold">$15.00</span></div>
          </div>
          <div className="mt-2 flex items-end justify-between border-t border-outline-variant pt-2">
            <span className="pb-1 text-[11px] font-semibold uppercase text-on-surface-variant">Total</span>
            <span className="font-display text-2xl tracking-tight text-on-background">$450.00</span>
          </div>
          <div className="btn-primary mt-2 min-h-0 w-full py-2 text-[13px]">
            <Icon name="attach_file" size={15} /> Looks right — send it
          </div>
        </div>
      </MockShell>
    ),
  },
  {
    id: 'send',
    tab: 'invoices',
    headline: 'Send it',
    body: 'One tap makes the PDF and sends it. Email or text, your call.',
    spotlight: 'send',
    mock: (
      <MockShell active="invoices">
        <div className="card p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-sm font-bold">Cyril</div>
              <div className="text-[11px] text-on-surface-variant">INV-0001 · draft</div>
            </div>
            <div className="font-display text-base font-bold text-primary">$450.00</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip min-h-0 gap-1 border-paid px-2 py-1 text-[11px] text-paid">
              <Icon name="check_circle" size={14} /> Mark paid
            </span>
            <span data-spotlight="send" className="chip min-h-0 gap-1 px-2 py-1 text-[11px]">
              <Icon name="attach_file" size={14} /> Share PDF
            </span>
          </div>
        </div>
        <div className="mt-2 rounded-input border border-outline-variant bg-surface-container-lowest p-3">
          <div className="mb-2 h-2 w-16 rounded bg-surface-variant" />
          <div className="mb-1 h-1.5 w-full rounded bg-surface-variant/70" />
          <div className="mb-1 h-1.5 w-4/5 rounded bg-surface-variant/70" />
          <div className="h-1.5 w-2/3 rounded bg-surface-variant/70" />
        </div>
      </MockShell>
    ),
  },
  {
    id: 'paid',
    tab: 'invoices',
    headline: 'Mark it paid',
    body: 'Every invoice reads draft, sent, or paid. Tap Mark paid the second the money lands — anything still owed stays up top.',
    spotlight: 'markpaid',
    mock: (
      <MockShell active="invoices">
        <div className="mb-2 flex gap-1.5">
          <span className="chip min-h-0 px-2.5 py-1 text-[11px]">All</span>
          <span className="chip chip-selected min-h-0 px-2.5 py-1 text-[11px]">Unpaid</span>
          <span className="chip min-h-0 px-2.5 py-1 text-[11px]">Paid</span>
        </div>
        <div className="card p-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-display text-sm font-bold">Cyril</div>
              <div className="text-[11px] text-on-surface-variant/70">INV-0001</div>
            </div>
            <span className="status-chip bg-sent-container px-2 py-1 text-[10px] text-sent">
              <Icon name="send" size={13} /> sent
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-display text-lg tracking-tight text-on-background">$450.00</span>
            <span data-spotlight="markpaid" className="chip min-h-0 gap-1 border-paid px-2 py-1 text-[11px] text-paid">
              <Icon name="check_circle" size={14} /> Mark paid
            </span>
          </div>
        </div>
      </MockShell>
    ),
  },

  // ── Chat: what you do by talking, outside the invoice flow ───────
  {
    id: 'receipt',
    tab: 'chat',
    headline: 'Snap the receipt',
    body: 'Take a picture of it or upload one from your phone. On It pulls out the amount and logs the expense.',
    spotlight: 'capture',
    mock: (
      <MockShell active="chat">
        <div className="space-y-2">
          <MockBubble role="assistant">Snap a photo of any receipt and I&apos;ll log the expense for you.</MockBubble>
        </div>
        <MockComposer captureId="capture" />
      </MockShell>
    ),
  },
  {
    id: 'voiceexpense',
    tab: 'chat',
    headline: 'Just say what you spent',
    body: 'No receipt handy? Say “spent forty on parts at the supply house” and On It logs it as an expense — amount, vendor, category.',
    spotlight: 'mic',
    mock: (
      <MockShell active="chat">
        <div className="space-y-2">
          <MockBubble role="user">Spent forty on parts at the supply house.</MockBubble>
          <MockBubble role="assistant">Logged it — $40.00 at the supply house, filed under supplies.</MockBubble>
        </div>
        <MockComposer micId="mic" />
      </MockShell>
    ),
  },

  // ── Books: where the money adds up ───────────────────────────────
  {
    id: 'expenseslanding',
    tab: 'books',
    headline: 'Every expense lands in Books',
    body: "Snap it or say it — either way it drops straight into Books, sorted by category, so nothing's lost when taxes come around.",
    spotlight: 'seeall',
    mock: (
      <MockShell active="books">
        <div className="space-y-2">
          <div className="card p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Recent expenses</div>
            <div className="space-y-2">
              {[
                { icon: 'shopping_cart', label: 'Supplies', vendor: 'Supply house', amount: '$40.00' },
                { icon: 'local_gas_station', label: 'Fuel', vendor: 'Shell', amount: '$45.00' },
                { icon: 'build', label: 'Tools', vendor: 'Hardware store', amount: '$120.00' },
              ].map((e) => (
                <div key={e.label} className="flex items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-error-container text-error">
                    <Icon name={e.icon} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-on-background">{e.label}</div>
                    <div className="text-[10px] text-on-surface-variant/70">{e.vendor}</div>
                  </div>
                  <span className="font-display text-[13px] font-bold text-on-background">{e.amount}</span>
                </div>
              ))}
            </div>
          </div>
          <div data-spotlight="seeall" className="btn-outline min-h-0 w-full py-2 text-[13px] text-primary">
            See all expenses <Icon name="arrow_forward" size={14} />
          </div>
        </div>
      </MockShell>
    ),
  },
  {
    id: 'books',
    tab: 'books',
    headline: 'Books adds it all up',
    body: "Money collected, what's still owed, what you've spent, and what's tax-deductible — totaled for you and updated as you work.",
    spotlight: 'totals',
    mock: (
      <MockShell active="books">
        <div data-spotlight="totals" className="space-y-2">
          <div className="rounded-card bg-inverse-surface p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-inverse-primary/80">Net (all time)</div>
            <div className="font-display text-2xl tracking-tight text-inverse-primary">$3,180.00</div>
            <div className="mt-0.5 text-[10px] text-inverse-on-surface/60">12 invoices created</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Collected" value="$4,050" icon="check_circle" iconCls="bg-paid-container text-paid" tone="text-paid" />
            <MiniStat label="Still owed" value="$900" icon="pending" iconCls="bg-primary-fixed text-primary" tone="text-primary" />
            <MiniStat label="Spent" value="$870" icon="shopping_cart" iconCls="bg-error-container text-error" tone="text-error" />
            <MiniStat label="Deductible" value="$610" icon="receipt_long" iconCls="bg-secondary-container text-on-surface" tone="text-on-surface" />
          </div>
        </div>
      </MockShell>
    ),
  },
  {
    id: 'tax',
    tab: 'books',
    headline: 'One PDF for tax time',
    body: 'Your spending totaled by category, for any stretch of the year. Export it and send it straight to whoever does your taxes.',
    spotlight: 'taxsummary',
    mock: (
      <MockShell active="books">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Spent" value="$8,940" icon="shopping_cart" iconCls="bg-error-container text-error" tone="text-error" />
          <MiniStat label="Deductible" value="$6,120" icon="receipt_long" iconCls="bg-secondary-container text-on-surface" tone="text-on-surface" />
        </div>
        <div className="mt-2 space-y-2">
          <div className="btn-primary min-h-0 w-full py-2 text-[13px]">
            <Icon name="add" size={16} /> Add expense
          </div>
          <div className="btn-outline min-h-0 w-full py-2 text-[13px] text-primary">
            See all expenses <Icon name="arrow_forward" size={14} />
          </div>
          <div data-spotlight="taxsummary" className="btn-outline min-h-0 w-full py-2 text-[13px] text-primary">
            <Icon name="receipt_long" size={14} /> Tax summary
          </div>
        </div>
      </MockShell>
    ),
  },
];

/** Pick slides by id, preserving the given order. Used by the first-run
 *  carousel to assemble its short linear sequence from the shared set. */
export function slidesByIds(ids: string[]): Slide[] {
  return ids
    .map((id) => SLIDES.find((s) => s.id === id))
    .filter((s): s is Slide => Boolean(s));
}

/** Slides for one reference-doc tab, in array order. */
export function slidesForTab(tab: SlideTab): Slide[] {
  return SLIDES.filter((s) => s.tab === tab);
}
