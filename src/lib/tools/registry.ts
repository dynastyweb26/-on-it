// ═══ AI Smart · the registry ═══
//
// The one place the model's tool surface is assembled. It builds at module load,
// so an incomplete tool, a duplicate name or a fixture that contradicts its own
// schemas is a BUILD failure rather than a bad turn.
//
// Adding a tool: write one file in ./definitions, add it to ./definitions/index.ts.
// Nothing else changes here. See TOOLS.md.
import type Anthropic from '@anthropic-ai/sdk';
import { buildRegistry, type ToolDefinition } from './contract';
import { TOOL_DEFINITIONS } from './definitions';

export const REGISTRY = buildRegistry(TOOL_DEFINITIONS);

/** What the model is offered. Derived from each tool's own Zod input schema. */
export const TOOLS: Anthropic.Tool[] = REGISTRY.modelTools();

export function findTool(name: string): ToolDefinition | undefined {
  return REGISTRY.find(name);
}

export type ParsedCall =
  | { ok: true; tool: ToolDefinition; args: unknown }
  | { ok: false; reason: 'unknown_tool' | 'invalid_args' };

/** Validate a tool call before anything runs. Unknown names never execute. */
export function parseCall(name: string, input: unknown): ParsedCall {
  const tool = REGISTRY.find(name);
  if (!tool) return { ok: false, reason: 'unknown_tool' };
  const parsed = tool.input.safeParse(input ?? {});
  return parsed.success
    ? { ok: true, tool, args: parsed.data }
    : { ok: false, reason: 'invalid_args' };
}
