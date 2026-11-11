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
 * The chat card a tool's result renders into. `id` is graded by the eval runner
 * and `props` is validated by the safety suite, so a tool can never claim a
 * template that cannot render its own result.
 */
export type ToolTemplate = { id: string; props: z.ZodType };

export type ToolDefinition = {
  name: string;
  description: string;
  input: z.ZodType;
  output: z.ZodType;
  type: ToolType;
  risk: ToolRisk;
  defaultTemplate: ToolTemplate;
  handler: (ctx: ToolContext, args: unknown) => Promise<unknown>;
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
  if (!nonEmpty(template?.id) || !/^[a-z][a-z0-9_]*$/.test(template.id)) {
    problems.push('defaultTemplate.id: snake_case template id');
  }
  if (!isZod(template?.props)) problems.push('defaultTemplate.props: a Zod schema');
  if (typeof tool?.handler !== 'function') problems.push('handler: a function');
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
  handler: (ctx: ToolContext, args: z.infer<In>) => Promise<z.infer<Out>>;
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
    templates.add(tool.defaultTemplate.id);
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
