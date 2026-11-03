// ═══ Does the bank card fit the screen? ═══
// The sheet is a fixed-height column: handle, header, tabs, the page dots, the
// card zone and (pointer devices only) the prev/next arrows. The card's own body
// is the only part allowed to give, so the arithmetic here is what the layout
// test checks: with the body shrinking to fit, the pinned pair of buttons still
// lands inside the dialog at 390x700 and at 1280x700, whatever the body holds.
//
// The numbers mirror ReviewStack's classes (h-[52px] header, h-11 tabs, the
// 10px dot row, the h-11 arrow row) and the cards' pinned min-h buttons. They
// are deliberately one place: change the shell and this module has to change.
export type StackCardShape = 'expense' | 'deposit-existing' | 'deposit-chips';

export const STACK_SHELL = {
  /** The phone sheet stops above the app's 64px tab bar. */
  tabBar: 64,
  /** Dialog-to-screen margin. */
  marginPhone: 12,
  marginLaptop: 32,
  handle: 13,
  header: 52,
  tabs: 56,
  dots: 18,
  arrows: 55,
  /** Below this the card cannot even show its amount and first path. */
  minBody: 96,
} as const;

/** The pinned foot: two min-h buttons, their 8px gap, 12 + 18px padding. */
export const STACK_ACTION_BAR = 54 + 46 + 8 + 30;

/** Roughly what the body wants to show, before it is allowed to scroll. */
export const STACK_BODY_CONTENT: Record<StackCardShape, number> = {
  expense: 300,
  'deposit-existing': 440,
  'deposit-chips': 380,
};

export type StackBudget = {
  /** Usable dialog height. */
  modal: number;
  /** Everything above and below the card zone. */
  shell: number;
  /** Height the scrolling body gets. */
  body: number;
  /** The body overflows, so it scrolls instead of moving the buttons. */
  scrolls: boolean;
  /** Both buttons are inside the dialog. */
  buttonsInside: boolean;
};

export function stackBudget(width: number, height: number, shape: StackCardShape): StackBudget {
  const laptop = width >= 768;
  const viewport = height - (laptop ? 0 : STACK_SHELL.tabBar);
  const modal = viewport - (laptop ? STACK_SHELL.marginLaptop : STACK_SHELL.marginPhone);
  const shell = STACK_SHELL.handle + STACK_SHELL.header + STACK_SHELL.tabs
    + STACK_SHELL.dots + (laptop ? STACK_SHELL.arrows : 0);
  const body = modal - shell - STACK_ACTION_BAR;
  return {
    modal,
    shell,
    body,
    scrolls: STACK_BODY_CONTENT[shape] > body,
    buttonsInside: body >= STACK_SHELL.minBody,
  };
}
