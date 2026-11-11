// ═══ AI Smart · the registry ═══
//
// The one place the model's tool surface is assembled. It builds at module load,
// so an incomplete tool, a duplicate name or a fixture that contradicts its own
// schemas is a BUILD failure rather than a bad turn.
//
// Adding a tool: write one file in ./definitions, add it to ./definitions/index.ts.
// Nothing else changes here. See TOOLS.md.
import type Anthropic from '@anthropic-ai/sdk';
import { buildRegistry } from './contract';
import { TOOL_DEFINITIONS } from './definitions';

export const REGISTRY = buildRegistry(TOOL_DEFINITIONS);

/** What the model is offered. Derived from each tool's own Zod input schema. */
export const TOOLS: Anthropic.Tool[] = REGISTRY.modelTools();

export function findTool(name: string): ReturnType<typeof REGISTRY.find> {
  return REGISTRY.find(name);
}
