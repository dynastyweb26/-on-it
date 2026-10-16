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
  title: string;
  body: string;
}

export interface CoachTour {
  /** Human-readable name shown in "Tab · Step N of M" label. */
  name: string;
  steps: CoachStep[];
}

export const TOURS: Record<string, CoachTour> = {
  '/clients': {
    name: 'Clients',
    steps: [
      {
        selector: '[data-coach="clients-list"]',
        pad: 4, r: 16,
        title: 'Your client list',
        body: 'Every customer lives here. Tap a row to see their open invoices and what they owe you.',
      },
      {
        selector: '[data-coach="clients-add"]',
        pad: 6, r: 999,
        title: 'Add a client in seconds',
        body: 'Tap + to save a name, phone and address. You\'ll pick them when you send an invoice.',
      },
      {
        selector: '[data-coach="tab-bar"]',
        pad: 2, r: 18,
        title: 'Get around fast',
        body: 'Five tabs, one thumb. Invoices, Chat, Books and Settings are always a tap away.',
      },
    ],
  },
  '/invoices': {
    name: 'Invoices',
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
      },
    ],
  },
  '/chat': {
    name: 'Chat',
    steps: [
      {
        selector: '[data-coach="chat-messages"]',
        pad: 6, r: 20,
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
    steps: [
      {
        selector: '[data-coach="settings-profile"]',
        pad: 3, r: 14,
        title: 'Make it yours',
        body: 'Add your logo, business details and payment info. They show up on every invoice you send.',
      },
      {
        selector: '[data-coach="settings-payouts"]',
        pad: 5, r: 22,
        title: 'Money, handled',
        body: 'Connect payouts to get paid by card, and set recurring expenses so Books tracks them for you.',
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
