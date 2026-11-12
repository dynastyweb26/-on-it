// ═══ AI Smart · the registry ═══
//
// The one place the model's tool surface is assembled. It builds at module load,
// so an incomplete tool, a duplicate name or a fixture that contradicts its own
// schemas is a BUILD failure rather than a bad turn.
//
// Adding a tool: write one file in ./definitions, add it to ./definitions/index.ts.
// Nothing else changes here. See TOOLS.md.
import type Anthropic from '@anthropic-ai/sdk';
import { buildRegistry, type Registry, type ToolDefinition } from './contract';
import { TOOL_DEFINITIONS } from './definitions';
import type { TemplateId } from './templates';

export const REGISTRY = buildRegistry(TOOL_DEFINITIONS);

/** The template and the data its component is handed. */
export type ToolCard = { id: TemplateId; props: unknown };

/**
 * The card for one tool result, or null when the tool's own props schema rejects
 * it. Null is the rule, not a failure: the reply then shows the tool's plain-text
 * fallback. We never hand a component data it did not ask for, and never draw a
 * stand-in card for a template that has no component yet.
 */
export function cardFor(tool: ToolDefinition, output: unknown): ToolCard | null {
  const id = tool.templateFor?.(output) ?? tool.defaultTemplate.id;
  const chosen =
    id === tool.defaultTemplate.id ? tool.defaultTemplate : tool.alternateTemplate;
  if (!chosen || chosen.id !== id) return null;
  const props = chosen.props.safeParse(output);
  return props.success ? { id, props: props.data } : null;
}

/** What the model is offered. Derived from each tool's own Zod input schema. */
export const TOOLS: Anthropic.Tool[] = REGISTRY.modelTools();

export function findTool(name: string): ToolDefinition | undefined {
  return REGISTRY.find(name);
}

export type ParsedCall =
  | { ok: true; tool: ToolDefinition; args: unknown }
  | { ok: false; reason: 'unknown_tool' | 'invalid_args' };

/**
 * Validate a tool call before anything runs. Unknown names never execute.
 * `registry` is injectable so a synthetic registry (tests, evals) resolves its
 * own tools; production always passes the real one.
 */
export function parseCall(name: string, input: unknown, registry: Registry = REGISTRY): ParsedCall {
  const tool = registry.find(name);
  if (!tool) return { ok: false, reason: 'unknown_tool' };
  const parsed = tool.input.safeParse(input ?? {});
  return parsed.success
    ? { ok: true, tool, args: parsed.data }
    : { ok: false, reason: 'invalid_args' };
}
