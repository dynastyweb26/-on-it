// ═══ AI Smart · the chat template catalog ═══
//
// One id, one design file, one React component, one name. The ids below are
// copied verbatim from design/ai-templates/RULES.md §2; none may be renamed,
// invented or aliased here. A tool claims exactly one of them and the registry
// refuses the tool if it claims anything else.
//
// This module is data only: it never renders a card. A tool returns its data
// plus a plain-text fallback, and the component Claude Code builds from the
// design file is what draws the template. Until that component exists the reply
// is the fallback text — never a makeshift card.
import { z } from 'zod';

/** RULES §2, in the order the rule file lists them. */
export const TEMPLATE_IDS = [
  'list.ranked',
  'stat.tiles',
  'chart.trend',
  'chart.breakdown',
  'draft.message',
  'confirm.batch',
  'cant.do',
  'nav.link',
  'feedback.thumbs',
  'feedback.checkin',
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const TemplateIdSchema = z.enum(TEMPLATE_IDS);

export function isTemplateId(value: unknown): value is TemplateId {
  return TemplateIdSchema.safeParse(value).success;
}

/**
 * RULES §2: chart.trend falls back to stat.tiles at one point. The caller says
 * how many points it has; everything else renders as itself. A fallback is a
 * real template with its own component, not a stand-in.
 */
export function resolveTemplate(id: TemplateId, pointCount?: number): TemplateId {
  if (id === 'chart.trend' && pointCount === 1) return 'stat.tiles';
  return id;
}
