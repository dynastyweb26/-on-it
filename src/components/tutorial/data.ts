import type { TutorialTab } from '@/lib/tutorial-seen';

// Ported 1:1 from the approved Claude Design prototype
// (On It Tutorials.html, TUT + TABOF). Copy, order, timings, and step patches
// are unchanged. The notifications scene is intentionally absent (21 → 20).

export type ScreenKey =
  | 'chat'
  | 'invList'
  | 'invDetail'
  | 'estDetail'
  | 'clients'
  | 'books'
  | 'settings'
  | 'pay'
  | 'biz'
  | 'brand';

export type TypingStep = [text: string, start: number, base?: number];
export type CountStep = [to: number, start: number, duration: number];

export type StepPatch = {
  screen?: ScreenKey;
  tpl?: boolean;
  spot?: string | null;
  tc?: TypingStep;
  tcClear?: boolean;
  sub?: string;
  nameF?: boolean;
  jobF?: boolean;
  priceF?: boolean;
  cTotal?: CountStep;
  estCard?: boolean;
  job?: string;
  tap?: string;
  flash?: boolean;
  receipt?: boolean;
  exp?: boolean;
  cExp?: CountStep;
  fuel?: boolean;
  saved?: boolean;
  menu?: boolean;
  noComposer?: boolean;
  tName?: TypingStep;
  tJob?: TypingStep;
  tPrice?: TypingStep;
  ready?: boolean;
  scrollEnd?: boolean;
  copied?: boolean;
  seg?: 'inv' | 'est';
  cOpen?: CountStep;
  cDue?: CountStep;
  eState?: 'sent' | 'approved' | 'converted';
  sig?: [start: number, duration: number];
  convert?: boolean;
  toast?: boolean;
  tSearch?: TypingStep;
  tSearchClear?: boolean;
  bubble?: boolean;
  ps?: boolean;
  sheet?: boolean;
  tSheetName?: TypingStep;
  tSheetPrice?: TypingStep;
  psSaved?: boolean;
  suggest?: boolean;
  zero?: boolean;
  cNet?: CountStep;
  cOwed?: CountStep;
  cColl?: CountStep;
  cSpent?: CountStep;
  sparkle?: boolean;
  badge?: string;
  tPhone?: TypingStep;
  tEmail?: TypingStep;
  tTerms?: TypingStep;
  style?: 'friendly';
  brandScroll?: boolean;
  reverse?: boolean;
  dim?: boolean;
  build?: { card: number; client: number; price: number; job: number };
};

export type Scene = {
  h: string;
  sub: string;
  dur: number;
  spot: string;
  steps: [number, StepPatch][];
};

export type Tutorial = {
  name: string;
  icon: 'chat' | 'description' | 'group' | 'payments' | 'settings';
  end: string;
  scenes: Scene[];
};

export const TAB_OF_SCREEN: Record<ScreenKey, TutorialTab> = {
  chat: 'chat',
  invList: 'invoices',
  invDetail: 'invoices',
  estDetail: 'invoices',
  clients: 'clients',
  books: 'books',
  settings: 'settings',
  pay: 'settings',
  biz: 'settings',
  brand: 'settings',
};

export const HOME_SCREEN: Record<TutorialTab, ScreenKey> = {
  chat: 'chat',
  invoices: 'invList',
  clients: 'clients',
  books: 'books',
  settings: 'settings',
};

export const TUTORIAL_ORDER: TutorialTab[] = [
  'chat',
  'invoices',
  'clients',
  'books',
  'settings',
];

export const TUTORIALS: Record<TutorialTab, Tutorial> = {
  chat: {
    name: 'Chat',
    icon: 'chat',
    end: 'Now just type it.',
    scenes: [
      {
        h: 'Type it out',
        sub: 'Say the job. On It writes the invoice.',
        dur: 7.5,
        spot:
          'Two phases: A) message bar lit while typing, card empty · B) spotlight moves to card, fills client → job → price → total',
        steps: [
          [0, { screen: 'chat', tpl: true, spot: 'composer' }],
          [0.5, { tc: ['Invoice for Brandon $400 bedroom painting', 0.5, 0.14] }],
          [8.1, { tap: 'send' }],
          [8.35, { tcClear: true, spot: 'invCard', sub: 'Check it, then send.' }],
          [9.0, { nameF: true }],
          [9.7, { jobF: true }],
          [10.4, { priceF: true }],
          [11.0, { cTotal: [400, 11.0, 0.9] }],
        ],
      },
      {
        h: 'Estimates too',
        sub: 'Type it. The estimate builds itself.',
        dur: 7.5,
        spot:
          'Two phases: A) message bar lit while typing, card empty · B) card fills in order, then Make it an invoice / estimate toggle',
        steps: [
          [0, { screen: 'chat', tpl: true, spot: 'composer', estCard: true, job: 'Fence Repair' }],
          [0.4, { tc: ['Estimate for Brandon $400 fence repair', 0.4, 0.14] }],
          [7.6, { tap: 'send' }],
          [7.85, { tcClear: true, spot: 'invCard' }],
          [8.5, { nameF: true }],
          [9.2, { jobF: true }],
          [9.9, { priceF: true }],
          [10.5, { cTotal: [400, 10.5, 0.8] }],
          [11.8, { spot: 'toggle', sub: 'Switch between estimate and invoice.' }],
          [13.0, { tap: 'toggle' }],
          [13.25, { estCard: false }],
          [14.1, { sub: 'One tap. Same details.' }],
        ],
      },
      {
        h: 'Snap a receipt',
        sub: 'On It reads the total for you.',
        dur: 8,
        spot: 'Camera, then Save expense',
        steps: [
          [0, { screen: 'chat', spot: 'camera' }],
          [0.9, { tap: 'camera' }],
          [1.15, { flash: true, receipt: true, spot: null }],
          [1.6, { flash: false }],
          [2.3, { exp: true, cExp: [40, 2.6, 0.8] }],
          [3.5, { fuel: true }],
          [4.4, { spot: 'saveExpense', sub: 'Looks right? Save it.' }],
          [5.6, { tap: 'saveExpense' }],
          [5.85, { saved: true }],
        ],
      },
      {
        h: 'Prefer a form?',
        sub: 'Tap + for a guided template.',
        dur: 8,
        spot: '+ button, New invoice, total',
        steps: [
          [0, { screen: 'chat', spot: 'plus' }],
          [0.8, { tap: 'plus' }],
          [1.05, { menu: true, spot: null }],
          [1.8, { spot: 'menuInvoice' }],
          [2.6, { tap: 'menuInvoice' }],
          [2.9, { menu: false, spot: null, tpl: true, noComposer: true, sub: 'Fill in the blanks.' }],
          [3.4, { tName: ['Brandon', 3.4] }],
          [4.4, { nameF: true }],
          [4.6, { tJob: ['Bedroom Painting', 4.6] }],
          [6.5, { jobF: true }],
          [6.7, { tPrice: ['400.00', 6.7] }],
          [7.5, { priceF: true, cTotal: [400, 7.55, 0.7] }],
          [8.4, { spot: 'invFoot', sub: 'Same invoice. Your way.' }],
        ],
      },
      {
        h: 'Ready to share',
        sub: 'Your estimate is good to go.',
        dur: 8,
        spot: 'Ready to share chip, Copy link + Share, Revise',
        steps: [
          [0, { screen: 'chat', ready: true, spot: 'readyChip' }],
          [1.7, { spot: null, scrollEnd: true }],
          [2.5, { spot: 'shareBtns', sub: 'Copy the link or share it.' }],
          [3.4, { tap: 'copyLink' }],
          [3.65, { copied: true }],
          [
            4.7,
            {
              spot: 'revise',
              copied: false,
              sub: 'Revise makes an editable copy. The original and its link stay as they are.',
            },
          ],
          [6.7, { sub: 'Works for invoices too.' }],
        ],
      },
      {
        h: 'Start fresh, find old chats',
        sub: 'New chat: start a new one.',
        dur: 7,
        spot: 'New chat + Previous chats icons',
        steps: [
          [0, { screen: 'chat', spot: 'hdrIcons' }],
          [1.0, { spot: 'newChat' }],
          [1.8, { tap: 'newChat' }],
          [3.4, { spot: 'history', sub: 'Previous chats: pick up where you left off.' }],
          [4.2, { tap: 'history' }],
        ],
      },
    ],
  },
  invoices: {
    name: 'Invoices',
    icon: 'description',
    end: 'All your paperwork, sorted.',
    scenes: [
      {
        h: 'Everything you sent',
        sub: 'Invoices and estimates, side by side.',
        dur: 6.5,
        spot: 'Invoices / Estimates toggle',
        steps: [
          [0, { screen: 'invList', spot: 'segToggle' }],
          [1.8, { tap: 'segEst' }],
          [2.05, { seg: 'est' }],
          [3.8, { tap: 'segInv', sub: 'Flip between them anytime.' }],
          [4.05, { seg: 'inv' }],
        ],
      },
      {
        h: 'Open or paid',
        sub: 'See what is still owed.',
        dur: 8,
        spot: 'Open/Paid tabs, DUE + DRAFT badges, Pending/Signed',
        steps: [
          [0, { screen: 'invList', spot: 'statusTabs', cOpen: [1200, 0.3, 1.0] }],
          [1.4, { spot: 'dueBadge', sub: 'Due dates at a glance.' }],
          [2.8, { spot: 'draftBadge', sub: 'DRAFT means not sent yet.' }],
          [4.1, { tap: 'segEst', spot: null }],
          [4.35, { seg: 'est' }],
          [4.8, { spot: 'statusTabs', sub: 'Estimates: Pending or Signed.' }],
          [6.3, { spot: 'dueBadge', sub: 'Valid until, or sent.' }],
        ],
      },
      {
        h: 'Tap to open',
        sub: 'Everything for one invoice.',
        dur: 8,
        spot: 'Share PDF / Pay link / Download / View PDF, Record payment',
        steps: [
          [0, { screen: 'invList', spot: 'card1' }],
          [0.7, { tap: 'card1' }],
          [0.95, { screen: 'invDetail', spot: null, cDue: [400, 1.1, 0.8] }],
          [2.0, { spot: 'actions', sub: 'Share it, send a pay link, or save the PDF.' }],
          [4.4, { spot: 'recordPay', sub: 'Got paid? Record it here.' }],
          [5.8, { tap: 'recordPay' }],
        ],
      },
      {
        h: 'Signed? Convert it.',
        sub: 'Brandon signs. You convert.',
        dur: 8,
        spot: 'Signature, APPROVED chip, Convert to Invoice',
        steps: [
          [0, { screen: 'estDetail', eState: 'sent', spot: 'sigCard' }],
          [0.5, { sig: [0.5, 1.5] }],
          [2.2, { eState: 'approved', spot: 'estChip', sub: 'Approved, with signature.' }],
          [2.6, { convert: true }],
          [3.3, { spot: 'convertBtn', sub: 'One tap makes the invoice.' }],
          [4.5, { tap: 'convertBtn' }],
          [4.75, { eState: 'converted' }],
          [5.5, { toast: true, spot: 'toast', sub: "It's an invoice now, ready to send." }],
        ],
      },
    ],
  },
  clients: {
    name: 'Clients',
    icon: 'group',
    end: 'Your people, sorted.',
    scenes: [
      {
        h: 'Your people, A to Z',
        sub: 'Search by name.',
        dur: 7,
        spot: 'Search bar, A–Z scrubber',
        steps: [
          [0, { screen: 'clients', spot: 'search' }],
          [0.8, { tSearch: ['Bran', 0.9] }],
          [2.4, { tSearchClear: true }],
          [2.8, { spot: 'scrubber', sub: 'Or jump to a letter.' }],
          [3.6, { tap: 'scrubA' }],
          [4.3, { tap: 'scrubB' }],
          [4.5, { bubble: true }],
          [5.8, { bubble: false }],
        ],
      },
      {
        h: "See what's out",
        sub: 'Estimates waiting on a reply.',
        dur: 5.5,
        spot: '"2 estimates out" line',
        steps: [
          [0, { screen: 'clients', spot: 'clientRow' }],
          [1.2, { spot: 'estOut' }],
        ],
      },
      {
        h: 'Save your jobs',
        sub: 'Save it once. Reuse it every time.',
        dur: 8,
        spot: 'Products & Services tab, Add button, auto-filled price',
        steps: [
          [0, { screen: 'clients', spot: 'psTab' }],
          [0.6, { tap: 'psTab' }],
          [0.85, { ps: true, spot: null }],
          [1.3, { spot: 'addPS' }],
          [1.9, { tap: 'addPS' }],
          [2.15, { sheet: true, spot: null, tSheetName: ['Bedroom Painting', 2.4] }],
          [4.3, { tSheetPrice: ['400.00', 4.3] }],
          [5.2, { tap: 'sheetSave' }],
          [5.45, { sheet: false, psSaved: true }],
          [
            6.1,
            {
              screen: 'chat',
              tpl: true,
              noComposer: true,
              nameF: true,
              tJob: ['Bed', 6.4],
              sub: 'Pick it. The price fills in.',
            },
          ],
          [7.0, { suggest: true }],
          [7.5, { tap: 'suggest' }],
          [
            7.75,
            { suggest: false, jobF: true, priceF: true, cTotal: [400, 7.8, 0.6], spot: 'tplPrice' },
          ],
        ],
      },
    ],
  },
  books: {
    name: 'Books',
    icon: 'payments',
    end: 'Your money, clear.',
    scenes: [
      {
        h: 'Know where you stand',
        sub: 'Net: what you keep.',
        dur: 7.5,
        spot: 'Net, Still owed, Collected, Spent',
        steps: [
          [0, { screen: 'books', spot: 'net', zero: true, cNet: [3560, 0.3, 1.0] }],
          [1.9, { spot: 'owed', sub: 'Still owed: waiting on clients.', cOwed: [1200, 2.0, 0.8] }],
          [3.7, { spot: 'coll', sub: 'Collected: money in.', cColl: [4800, 3.8, 0.8] }],
          [5.5, { spot: 'spent', sub: 'Spent: money out.', cSpent: [1240, 5.6, 0.8] }],
        ],
      },
      {
        h: 'Log it fast',
        sub: 'Add a cost in seconds.',
        dur: 6.5,
        spot: 'Add expense, View expenses',
        steps: [
          [0, { screen: 'books', spot: 'addExpense' }],
          [1.4, { tap: 'addExpense' }],
          [2.6, { spot: 'viewExpenses', sub: 'Then find them all here.' }],
          [3.8, { tap: 'viewExpenses' }],
        ],
      },
      {
        h: 'Your recaps',
        sub: 'Your month, played back.',
        dur: 5.5,
        spot: 'Recaps card',
        steps: [
          [0, { screen: 'books', spot: 'recaps' }],
          [1.8, { tap: 'watchAgain' }],
          [2.1, { sparkle: true }],
        ],
      },
      {
        h: 'Recurring expenses',
        sub: 'Monthly charges, tracked for you.',
        dur: 6,
        spot: 'Recurring expenses row',
        steps: [
          [0, { screen: 'books', spot: 'recurring' }],
          [2.2, { tap: 'recurring' }],
          [3.0, { sub: 'Logged on its own, every month.' }],
        ],
      },
    ],
  },
  settings: {
    name: 'Settings',
    icon: 'settings',
    end: 'Set up and ready.',
    scenes: [
      {
        h: 'Get paid your way',
        sub: 'Set this up first.',
        dur: 8,
        spot: 'Payment options row, then each method',
        steps: [
          [0, { screen: 'settings', spot: 'paymentRow', badge: 'DO THIS FIRST' }],
          [1.0, { tap: 'paymentRow' }],
          [1.25, { screen: 'pay', spot: null }],
          [1.9, { spot: 'payCard', sub: 'Cards and digital wallets.' }],
          [3.4, { spot: 'payBank', sub: 'Bank transfer.' }],
          [4.9, { spot: 'payApps', sub: 'Zelle, Cash App, PayPal, Venmo.' }],
          [6.5, { sub: 'Clients pay the way they like.' }],
        ],
      },
      {
        h: 'Your business info',
        sub: 'Printed on every estimate and invoice.',
        dur: 8,
        spot: 'Name, phone, email, terms',
        steps: [
          [0, { screen: 'biz', spot: 'bizTop' }],
          [1.3, { spot: 'bizPhone', tPhone: ['(555) 010-0199', 1.5] }],
          [3.3, { spot: 'bizEmail', tEmail: ['hello@example.com', 3.5] }],
          [5.5, { spot: 'bizTerms', tTerms: ['50% deposit to book the job.', 5.7] }],
        ],
      },
      {
        h: 'Make it yours',
        sub: 'Your logo on every invoice.',
        dur: 8,
        spot: 'Logo, 4 invoice styles, colors',
        steps: [
          [0, { screen: 'brand', spot: 'logo' }],
          [1.8, { spot: 'templates', sub: 'Pick one of four styles.' }],
          [3.0, { tap: 'tplFriendly' }],
          [3.25, { style: 'friendly' }],
          [4.6, { spot: null, brandScroll: true }],
          [5.2, { spot: 'colors', sub: 'Then pick your colors.' }],
        ],
      },
    ],
  },
};
