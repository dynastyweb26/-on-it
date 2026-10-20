/* ═══ Coach-mark step definitions ═══
   One "tour" per tab.  Each step names a CSS selector that targets a real
   DOM element in the live app — the overlay measures it and draws the
   spotlight ring at that position.  Selectors are intentionally simple
   (data-coach attributes, aria-labels) so they survive DOM refactors. */

export interface CoachStep {
  /** CSS selector for the element to spotlight.  Must exist while the step
   *  is shown (the overlay skips measurement when the element is absent). */
  selector: string;
  /** Padding (px) added around the measured rect on every side. */
  pad?: number;
  /** Border-radius of the spotlight cutout (px or 9999 for a pill/circle). */
  r?: number;
  /** Max spotlight height (px). Caps tall targets like scroll containers;
   *  the cutout stays anchored to the target's top edge. */
  maxH?: number;
  title: string;
  body: string;
  /** Replacement target + copy when the tab's list is empty (see
   *  CoachTour.empty). Unset fields keep the step's own values. */
  whenEmpty?: Partial<Pick<CoachStep, 'selector' | 'pad' | 'r' | 'title' | 'body'>>;
  /** Drop this step when the list is empty (its target isn't rendered). */
  skipWhenEmpty?: boolean;
  /** Only run this step while an element matching the selector is on the
   *  page (see CoachTour.settle). */
  onlyWhen?: string;
  /** Drop this step while an element matching the selector is on the page. */
  skipWhen?: string;
}

export interface CoachTour {
  /** Human-readable name shown in "Tab · Step N of M" label. */
  name: string;
  steps: CoachStep[];
  /** For tabs whose steps depend on a list: `when` is visible only when the
   *  list is empty, `ready` only when it has rows. CoachMarks waits for one
   *  of them (data loads after the tab mounts) before picking the steps. */
  empty?: { when: string; ready: string };
  /** Selector of an element that appears once the data the steps' onlyWhen /
   *  skipWhen conditions read has loaded. CoachMarks waits for it (up to 4s)
   *  before picking the steps. */
  settle?: string;
}

/** The steps to run, given whether the tab's list is empty. */
export function stepsFor(
  tour: CoachTour,
  isEmpty: boolean,
  /** Is there an element on the page matching this selector? */
  matches: (selector: string) => boolean = () => false,
): CoachStep[] {
  const steps = tour.steps.filter((s) =>
    (!s.onlyWhen || matches(s.onlyWhen)) && !(s.skipWhen && matches(s.skipWhen)));
  if (!isEmpty) return steps;
  return steps
    .filter((s) => !s.skipWhenEmpty)
    .map((s) => (s.whenEmpty ? { ...s, ...s.whenEmpty } : s));
}

/** The Settings Payouts row carries data-payouts-set="no" when no payout
 *  method is configured (set once the row's data has loaded, "yes" otherwise). */
export const PAYOUTS_UNSET = '[data-payouts-set="no"]';

export const TOURS: Record<string, CoachTour> = {
  '/clients': {
    name: 'Clients',
    empty: { when: '[data-coach="clients-empty-add"]', ready: '[data-coach="clients-add"]' },
    steps: [
      {
        selector: '[data-coach="clients-list"]',
        pad: 4, r: 16,
        title: 'Your client list',
        body: 'Every customer lives here. Tap a row to see their open invoices and what they owe you.',
        whenEmpty: {
          selector: '[data-coach="clients-empty-add"]',
          pad: 6, r: 999,
          title: 'Add your first client',
          body: 'No clients yet. Tap Add client to save a name, phone and address. You\'ll pick them when you send an invoice.',
        },
      },
      {
        selector: '[data-coach="clients-add"]',
        pad: 6, r: 999,
        title: 'Add a client in seconds',
        body: 'Tap + to save a name, phone and address. You\'ll pick them when you send an invoice.',
        skipWhenEmpty: true, // the + only shows once there are clients; step 1 covers it
      },
      {
        // Bottom tab bar on phones; the sidebar nav from md (768px) up.
        selector: '[data-coach="tab-bar"], [data-coach="side-nav"]',
        pad: 2, r: 18,
        title: 'Get around fast',
        body: 'Five tabs, one thumb. Invoices, Chat, Books and Settings are always a tap away.',
      },
    ],
  },
  '/invoices': {
    name: 'Invoices',
    empty: { when: '[data-coach="invoices-empty"]', ready: '[data-coach="invoices-list"] a[href^="/invoices/"]' },
    steps: [
      {
        selector: '[data-coach="invoices-filter"]',
        pad: 6, r: 16,
        title: 'Filter by status',
        body: 'See everything, or just what\'s unpaid, paid, or still a quote. Your money, sorted.',
      },
      {
        selector: '[data-coach="invoices-list"]',
        pad: 4, r: 22,
        title: 'Drafts wait for you',
        body: 'Anything marked DRAFT hasn\'t been sent yet. Open it, finish it, get it out the door.',
        whenEmpty: {
          selector: '[data-coach="invoices-empty"]',
          pad: 10, r: 16,
          title: 'Your invoices land here',
          body: 'Nothing here yet. Tell Chat about a job and its invoice shows up here as a DRAFT, ready to finish and send.',
        },
      },
    ],
  },
  '/chat': {
    name: 'Chat',
    steps: [
      {
        selector: '[data-coach="chat-messages"]',
        pad: 6, r: 20, maxH: 260,
        title: 'Meet your assistant',
        body: 'Tell On It what you did in plain words. It writes the invoice for you.',
      },
      {
        selector: '[data-coach="chat-composer"]',
        pad: 4, r: 999,
        title: 'Snap a receipt or say what you spent',
        body: 'Use the camera to log an expense on the spot, or type a job and hit send.',
      },
    ],
  },
  '/dashboard': {
    name: 'Books',
    steps: [
      {
        selector: '[data-coach="books-net"]',
        pad: 5, r: 26,
        title: 'Your net, at a glance',
        body: 'Money in minus money out, across every invoice. Tap it for the full breakdown.',
      },
      {
        selector: '[data-coach="books-add-expense"]',
        pad: 5, r: 999,
        title: 'Log expenses as you go',
        body: 'Fuel, parts, tools. Add them on the spot so tax time takes minutes, not weekends.',
      },
      {
        selector: '[data-coach="books-stats"]',
        pad: 5, r: 22,
        title: 'Where it all stands',
        body: 'Collected, still owed and spent. Three numbers that tell you how the month is going.',
      },
    ],
  },
  '/settings': {
    name: 'Settings',
    settle: '[data-payouts-set]',
    steps: [
      {
        selector: '[data-coach="settings-profile"]',
        pad: 3, r: 14,
        title: 'Make it yours',
        body: 'Add your logo, business details and payment info. They show up on every invoice you send.',
      },
      {
        // New users: no payout method yet. Points at Settings → Payouts.
        // Skipped (and the general step below runs instead) once one is set.
        selector: '[data-coach="settings-payouts"]',
        pad: 5, r: 22,
        title: 'Set up how you get paid',
        body: 'No payment method yet. Add Zelle, Cash App, PayPal, Venmo, a bank account or card payments in Settings, so your clients can pay you.',
        onlyWhen: PAYOUTS_UNSET,
      },
      {
        selector: '[data-coach="settings-payouts"]',
        pad: 5, r: 22,
        skipWhen: PAYOUTS_UNSET,
        title: 'Money, handled',
        body: 'Connect a payment processor to get paid by card, and set recurring expenses so Books tracks them for you.',
      },
      {
        selector: '[data-coach="settings-replay"]',
        pad: 5, r: 999,
        title: 'Watch this again anytime',
        body: 'Tap How On It works whenever you need a refresher. It replays this tour.',
      },
    ],
  },
};

/** Tabs that have a tour, in the order they appear in the bottom nav. */
export const TOUR_TABS = Object.keys(TOURS);
