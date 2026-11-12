// ═══ AI Smart · the tool contract ═══
//
// Every tool in the registry is one object with the same nine fields, and the
// registry REFUSES TO LOAD if one is missing or malformed. That is the point of
// this file: a half-described tool cannot exist, so the shared safety suite
// (item 10) can loop over the registry and mean something.
//
// No database access and no model calls live here — only types, the one
// definition helper, validation, and the model-facing JSON schema derived from
// the tool's own Zod input. One schema, one description, one handler per tool.
//
// Handlers receive a ToolDb, never a Supabase client and never the service role.
// The CI check (scripts/ci/no-admin-client-in-tools.mjs) fails the build if any
// file under src/lib/tools reaches adminClient, directly or through a helper.
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { TEMPLATE_IDS, isTemplateId, type TemplateId } from './templates';

/** What a tool does to the world. write and send never run without a confirm token. */
export const TOOL_TYPES = ['read', 'write', 'send', 'nav', 'meta'] as const;
export type ToolType = (typeof TOOL_TYPES)[number];

/** How much damage a mistake costs. High risk means money or a client-visible send. */
export const TOOL_RISKS = ['low', 'medium', 'high'] as const;
export type ToolRisk = (typeof TOOL_RISKS)[number];

/**
 * The only database surface a tool may use. Narrow on purpose: a select plan,
 * scoped to the caller's own session. A fixture-backed implementation makes the
 * whole registry testable without a network or a live project.
 */
export type SelectPlan = {
  columns: string;
  /** Equality filters, ANDed. */
  eq?: Record<string, string | number | boolean>;
  /** IS NULL filters. */
  is?: Record<string, null>;
  /** IN filters. */
  in?: Record<string, readonly (string | number)[]>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
};

export type ToolQueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export interface ToolDb {
  select<T>(table: string, plan: SelectPlan): Promise<ToolQueryResult<T>>;
}

/** What a handler gets: the caller-scoped db and the caller's id, nothing else. */
export type ToolContext = { db: ToolDb; userId: string };

/**
 * The chat card a tool's result renders into. `id` is one of the ten ids in
 * ./templates (RULES.md §2) and `props` is validated by the safety suite, so a
 * tool can never claim a template that cannot render its own result.
 */
export type ToolTemplate = { id: TemplateId; props: z.ZodType };

export type ToolDefinition = {
  name: string;
  description: string;
  input: z.ZodType;
  output: z.ZodType;
  type: ToolType;
  risk: ToolRisk;
  defaultTemplate: ToolTemplate;
  /**
   * A fixed set of templates this tool may return, declared up front (the
   * default is always one of them). templateFor chooses among these; no tool
   * may return an id it did not declare here.
   */
  templates?: readonly ToolTemplate[];
  /**
   * The object to parse against the chosen template's props. Defaults to the
   * whole result. A tool with several card shapes (a report's tiles, trend,
   * breakdown and ranked list) names the right slice here.
   */
  propsFor?: (result: unknown, id: TemplateId) => unknown;
  /**
   * Where this tool's full list lives, for list.ranked's "Show all N". Required
   * for that template, so the card never has to guess a screen.
   */
  destination?: { screen: string; path: string };
  /**
   * A second template this tool may return, with its own props schema (e.g.
   * nav.link for 1-3 matches, list.ranked above that). Never a third, never an
   * id the tool did not declare.
   */
  alternateTemplate?: ToolTemplate;
  /** Chooses between the default and the alternate for one result. */
  templateFor?: (result: unknown) => TemplateId | null;
  handler: (ctx: ToolContext, args: unknown) => Promise<unknown>;
  /**
   * The plain-text answer shown when the template's component is not built yet
   * (or its props do not fit). Pure, composed by the server, never a card.
   */
  fallback: (result: never) => string;
  /** A real, valid call and its result. Fixtures power tests, never a live turn. */
  fixture: { args: unknown; result: unknown };
  /**
   * What the model is shown of a result. Optional: the result itself by default.
   * A tool that returns row-level numbers uses this to send only the figures the
   * model may reason about, so there is nothing tempting to quote back.
   */
  modelPayload?: (result: never) => unknown;
};

const isZod = (value: unknown): value is z.ZodType =>
  typeof (value as { safeParse?: unknown } | null)?.safeParse === 'function';

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * A fallback is what the user reads when there is no card, so it is plain text:
 * no markup, no emoji, no fenced code. Money in it is already server-formatted.
 */
export function isPlainText(value: string): boolean {
  return !/[<>`]/.test(value)
    && !/\*\*|^#{1,6}\s/m.test(value)
    && !/\p{Extended_Pictographic}/u.test(value);
}

/** Every field a tool must carry, in the order the error lists them. */
export const REQUIRED_FIELDS = [
  'name',
  'description',
  'input',
  'output',
  'type',
  'risk',
  'defaultTemplate',
  'handler',
  'fallback',
  'fixture',
] as const;

/**
 * Throws with every problem at once, naming the tool. Called for every tool at
 * registry load, so a bad definition breaks the build instead of a user's turn.
 */
export function assertComplete(tool: Partial<ToolDefinition> | null | undefined): asserts tool is ToolDefinition {
  const problems: string[] = [];
  const name = nonEmpty(tool?.name) ? tool.name : '(unnamed tool)';

  if (!nonEmpty(tool?.name) || !/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    problems.push('name: snake_case, starting with a letter');
  }
  if (!nonEmpty(tool?.description) || tool.description.trim().length < 20) {
    problems.push('description: at least 20 characters for the model to choose by');
  }
  if (!isZod(tool?.input)) problems.push('input: a Zod schema');
  if (!isZod(tool?.output)) problems.push('output: a Zod schema');
  if (!TOOL_TYPES.includes(tool?.type as ToolType)) {
    problems.push(`type: one of ${TOOL_TYPES.join('|')}`);
  }
  if (!TOOL_RISKS.includes(tool?.risk as ToolRisk)) {
    problems.push(`risk: one of ${TOOL_RISKS.join('|')}`);
  }
  const template = tool?.defaultTemplate;
  if (!isTemplateId(template?.id)) {
    problems.push(`defaultTemplate.id: one of ${TEMPLATE_IDS.join('|')}`);
  }
  if (!isZod(template?.props)) problems.push('defaultTemplate.props: a Zod schema');
  if (template?.id === 'list.ranked') {
    const d = tool?.destination;
    if (!nonEmpty(d?.screen) || !nonEmpty(d?.path) || !d.path.startsWith('/')) {
      problems.push('destination: list.ranked needs { screen, path } with an in-app path');
    }
  }
  const templates = tool?.templates;
  if (templates !== undefined) {
    if (!Array.isArray(templates) || templates.length === 0) {
      problems.push('templates: a non-empty fixed list');
    } else {
      const ids = new Set<string>();
      for (const entry of templates) {
        if (!isTemplateId(entry?.id)) problems.push('templates.id: a template id');
        if (!isZod(entry?.props)) problems.push('templates.props: a Zod schema');
        if (isTemplateId(entry?.id)) {
          if (ids.has(entry.id)) problems.push(`templates: duplicate ${entry.id}`);
          ids.add(entry.id);
        }
      }
      if (isTemplateId(tool?.defaultTemplate?.id) && !ids.has(tool.defaultTemplate.id)) {
        problems.push('templates: must include the default template');
      }
    }
    if (typeof tool?.propsFor !== 'function') {
      problems.push('propsFor: required when templates declares more than one shape');
    }
  } else if (tool?.propsFor !== undefined) {
    problems.push('propsFor: only allowed with templates');
  }

  const alternate = tool?.alternateTemplate;
  if (alternate !== undefined) {
    if (!isTemplateId(alternate.id)) problems.push('alternateTemplate.id: a template id');
    if (alternate.id === tool?.defaultTemplate?.id) {
      problems.push('alternateTemplate.id: must differ from the default');
    }
    if (!isZod(alternate.props)) problems.push('alternateTemplate.props: a Zod schema');
    if (templates !== undefined && !templates.some((entry) => entry.id === alternate.id)) {
      problems.push('alternateTemplate.id: must also be declared in templates');
    }
  }
  if (typeof tool?.templateFor === 'function') {
    if (templates === undefined && alternate === undefined) {
      problems.push('templateFor: only allowed with a second declared template');
    }
  } else if (alternate !== undefined || (templates !== undefined && templates.length > 1)) {
    problems.push('templateFor: required when more than one template is declared');
  }
  if (typeof tool?.handler !== 'function') problems.push('handler: a function');
  if (typeof tool?.fallback !== 'function') {
    problems.push('fallback: a function returning the plain-text answer');
  }
  if (
    tool?.fixture == null ||
    !('args' in tool.fixture) ||
    !('result' in tool.fixture)
  ) {
    problems.push('fixture: { args, result }');
  }

  if (problems.length) {
    throw new Error(`tool ${name} is incomplete: ${problems.join('; ')}`);
  }

  // A fixture that does not satisfy the tool's own schemas is a lie the tests
  // would inherit. Refuse it at load.
  const complete = tool as ToolDefinition;
  const args = complete.input.safeParse(complete.fixture.args);
  if (!args.success) {
    throw new Error(`tool ${name} fixture.args do not match its input schema: ${args.error.message}`);
  }
  const result = complete.output.safeParse(complete.fixture.result);
  if (!result.success) {
    throw new Error(`tool ${name} fixture.result does not match its output schema: ${result.error.message}`);
  }

  // templateFor may only choose an id the tool declared, and its choice for the
  // fixture must be a real template with props.
  if (complete.templateFor) {
    const chosen = complete.templateFor(result.data);
    // null means "answer in plain text, no card" (e.g. no client by that name).
    const declared = declaredTemplateIds(complete);
    if (chosen !== null && !declared.includes(chosen)) {
      throw new Error(`tool ${name} templateFor returned ${chosen}, which it did not declare`);
    }
  }

  // The fallback is shown to the user whenever no component exists, so it is
  // proven here: non-empty plain text for the tool's own fixture, never a card.
  const fallback = complete.fallback(result.data as never);
  if (!nonEmpty(fallback) || !isPlainText(fallback)) {
    throw new Error(`tool ${name} fallback must be non-empty plain text`);
  }
}

/**
 * The one way to describe a tool. The generic parameters keep `args` typed from
 * the Zod input at the definition site, so a handler cannot read a field the
 * model is not allowed to send.
 */
export function defineTool<In extends z.ZodType, Out extends z.ZodType>(definition: {
  name: string;
  description: string;
  input: In;
  output: Out;
  type: ToolType;
  risk: ToolRisk;
  defaultTemplate: ToolTemplate;
  templates?: readonly ToolTemplate[];
  propsFor?: (result: unknown, id: TemplateId) => unknown;
  destination?: { screen: string; path: string };
  alternateTemplate?: ToolTemplate;
  templateFor?: (result: z.infer<Out>) => TemplateId | null;
  handler: (ctx: ToolContext, args: z.infer<In>) => Promise<z.infer<Out>>;
  fallback: (result: z.infer<Out>) => string;
  fixture: { args: z.input<In>; result: z.infer<Out> };
  modelPayload?: (result: z.infer<Out>) => unknown;
}): ToolDefinition {
  const tool = definition as unknown as ToolDefinition;
  assertComplete(tool);
  return tool;
}

/** The JSON schema the model sees, generated from the tool's own Zod input. */
export function inputSchemaJson(tool: ToolDefinition): Record<string, unknown> {
  const toJson = (z as unknown as {
    toJSONSchema?: (schema: z.ZodType, options?: Record<string, unknown>) => Record<string, unknown>;
  }).toJSONSchema;
  if (typeof toJson !== 'function') {
    throw new Error('zod toJSONSchema is unavailable: tools cannot be described to the model');
  }
  try {
    const schema = toJson(tool.input, { io: 'input' });
    delete schema.$schema;
    return schema;
  } catch (e) {
    throw new Error(`tool ${tool.name} input schema cannot be described to the model: ${(e as Error).message}`);
  }
}

/** Every template id a tool is allowed to return, in declaration order. */
export function declaredTemplateIds(tool: ToolDefinition): TemplateId[] {
  return tool.templates?.map((entry) => entry.id)
    ?? [tool.defaultTemplate.id, ...(tool.alternateTemplate ? [tool.alternateTemplate.id] : [])];
}

/** The declared template with this id, or undefined. */
export function declaredTemplate(tool: ToolDefinition, id: TemplateId): ToolTemplate | undefined {
  if (tool.templates) return tool.templates.find((entry) => entry.id === id);
  if (tool.defaultTemplate.id === id) return tool.defaultTemplate;
  return tool.alternateTemplate?.id === id ? tool.alternateTemplate : undefined;
}

export function toModelTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: inputSchemaJson(tool) as Anthropic.Tool['input_schema'],
  };
}

export type Registry = {
  list: readonly ToolDefinition[];
  /** Undefined for an unknown name: a model cannot invent a tool into existence. */
  find(name: string): ToolDefinition | undefined;
  /** Throws for an unknown name. Only for code paths that already resolved it. */
  get(name: string): ToolDefinition;
  modelTools(): Anthropic.Tool[];
  templates(): readonly string[];
};

/**
 * Validates every tool, then freezes the surface. Called at module load by
 * src/lib/tools/registry.ts, so an incomplete tool is a build failure.
 */
export function buildRegistry(tools: readonly ToolDefinition[]): Registry {
  const seen = new Set<string>();
  const templates = new Set<string>();

  for (const tool of tools) {
    assertComplete(tool);
    if (seen.has(tool.name)) throw new Error(`duplicate tool name: ${tool.name}`);
    seen.add(tool.name);
    for (const id of declaredTemplateIds(tool)) templates.add(id);
  }

  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const frozen = Object.freeze([...tools]);

  return {
    list: frozen,
    find: (name) => byName.get(name),
    get: (name) => {
      const tool = byName.get(name);
      if (!tool) throw new Error(`unknown tool: ${name}`);
      return tool;
    },
    modelTools: () => frozen.map(toModelTool),
    templates: () => Object.freeze([...templates]),
  };
}
