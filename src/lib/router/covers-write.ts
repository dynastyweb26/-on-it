// ═══ Chat router · does a registered write tool cover this message? ═══
//
// The figure rule ("a digit or a $ is a job") is what sent "add Ruth Lawrence as
// a client, 555-0100" to the invoice builder, and it is the same rule the regex
// fallback applies when the router is down. A phone number is not a job.
//
// So before the figure rule runs, the message is matched against the write tools
// the registry already has: a change verb plus one of that tool's own subjects
// (its name and the first sentence of its description). Nothing here names a
// tool, so a new write tool widens this automatically.
//
// Deliberately narrow: a subject and a verb both have to be there, and the shapes
// the builder owns (invoice, estimate, line item) never count for a product save.
// A message this does not recognise falls through to the old rules, unchanged.
import { REGISTRY } from '@/lib/tools/registry';
import type { Registry } from '@/lib/tools/contract';
import { writeIntents, type WriteIntent } from './write-intents';

/** Words that carry no subject: articles, pronouns, and the tools' own boilerplate. */
const STOP = new Set(
  `a an the and or but of on in by to for from with without into onto its it is are was were be been being
   this that these those one two app owner card cards saves save saved propose proposes proposing
   only not no does do cannot can found when while until then than as at if so we you your my our their
   they them there here what which who how much many more most less least same other such each any all
   both few own just about after before again further once too very will would should could may might
   must shall says saying exists already new old full whole line lines item items more`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * The verbs a change is spoken with, per tool-name verb. A verb not listed here
 * (a tool added later) still works: its own name is turned into a word match.
 */
const VERBS: Record<string, RegExp> = {
  create: /\b(?:add|create|set up)\b/,
  save: /\b(?:save|add)\b/,
  edit: /\b(?:edit|change|update|set|correct|fix)\b/,
  delete: /\b(?:delete|remove|erase|drop|get rid of)\b/,
  send: /\b(?:send|resend|email out|text out)\b/,
};

/** The builder's nouns: a "save" with a price on one of these is still a job. */
const BUILDER_NOUNS = /\b(?:invoice|estimate|line|lines)\b/;

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "clients" reads as "client"; "ss" and short words are left alone. */
function singular(word: string): string {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

const normalize = (text: string): string => text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

/** The first sentence of a description: the part that says what the tool changes. */
function firstSentence(description: string): string {
  const at = description.search(/\.\s/);
  return at < 0 ? description : description.slice(0, at);
}

/** A tool's subjects: the words after the verb in its name, plus its first sentence. */
function subjectsOf(intent: WriteIntent): string[] {
  const [, ...named] = intent.name.split('_');
  const described = firstSentence(intent.description)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  const words = [...named, ...described]
    .map(singular)
    .filter((word) => word.length >= 3 && !STOP.has(word) && !/(?:ing|ly)$/.test(word));
  return [...new Set(words)];
}

const subjectRe = (subject: string): RegExp => new RegExp(`\\b${escape(subject)}(?:s|es)?\\b`);

const cache = new WeakMap<Registry, WriteIntent[]>();

function intentsFor(registry: Registry): WriteIntent[] {
  const hit = cache.get(registry);
  if (hit) return hit;
  const built = writeIntents(registry);
  cache.set(registry, built);
  return built;
}

/**
 * True when a registered write tool can carry this message out: a change verb
 * AND one of that tool's subjects, whatever digits it has. "save <thing> at
 * <price>" is a saved product, so it counts too; "add a line for the filter," or
 * any invoice/estimate wording, does not.
 */
export function coveredByWriteTool(text: string, registry: Registry = REGISTRY): boolean {
  const t = normalize(text);
  if (!t) return false;

  const savedProduct = /\b(?:save|add)\b[^.]*\b(?:at|for)\s*\$?\d/.test(t) && !BUILDER_NOUNS.test(t);

  for (const intent of intentsFor(registry)) {
    const [verb] = intent.name.split('_');
    const verbRe = VERBS[verb] ?? new RegExp(`\\b${escape(verb)}(?:s|es|ed|d|ing)?\\b`);
    if (!verbRe.test(t)) continue;
    if (verb === 'save' && savedProduct) return true;
    if (subjectsOf(intent).some((subject) => subjectRe(subject).test(t))) return true;
  }
  return false;
}
