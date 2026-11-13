// One decision for every template card in the thread: draw it, or fall back to the
// text. A card is drawn only when its id is one the thread wires AND its props pass
// the schema in lib/templates/props.ts. Anything else is null, and the caller shows
// the stored fallback text. Never a broken card, never a stand-in.
import { TEMPLATE_PROPS, type CantDoProps, type NavLinkProps, type RankedListProps, type StatTilesProps } from '@/lib/templates/props';

/** The ids the chat thread renders in this round. No tool returns the others yet. */
export const THREAD_TEMPLATE_IDS = ['list.ranked', 'stat.tiles', 'nav.link', 'cant.do'] as const;
export type ThreadTemplateId = (typeof THREAD_TEMPLATE_IDS)[number];

export type ResolvedTemplate =
  | { id: 'list.ranked'; props: RankedListProps }
  | { id: 'stat.tiles'; props: StatTilesProps }
  | { id: 'nav.link'; props: NavLinkProps }
  | { id: 'cant.do'; props: CantDoProps };

const wired = (id: string): id is ThreadTemplateId => (THREAD_TEMPLATE_IDS as readonly string[]).includes(id);

export function resolveTemplate(card: { id: string; props: unknown } | null | undefined): ResolvedTemplate | null {
  if (!card || !wired(card.id)) return null;
  const parsed = TEMPLATE_PROPS[card.id].safeParse(card.props);
  return parsed.success ? ({ id: card.id, props: parsed.data } as ResolvedTemplate) : null;
}
