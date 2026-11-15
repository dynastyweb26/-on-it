// ═══ Chat router · the write tools it must know about ═══
//
// The router knew only lookups, so "add Ruth Lawrence as a client, 555-0100" had
// a figure in it and went to the invoice builder — create_client never ran.
//
// The list of things the app can change is built FROM THE REGISTRY, not written
// here: every tool of type write or send, with its name and description. A new
// write tool is routed the day it is registered; nobody edits the router.
//
// Pure data assembly (no I/O). The registry itself validates each tool at load.
import { REGISTRY } from '@/lib/tools/registry';
import type { Registry } from '@/lib/tools/contract';

export interface WriteIntent {
  /** The tool's registered name, e.g. edit_client. */
  name: string;
  /** The tool's own description, used verbatim in the router's rules. */
  description: string;
}

/**
 * Every registered tool that changes something (type write or send), in registry
 * order. Registry order, not a curated order: the router reads the same list the
 * app runs.
 */
export function writeIntents(registry: Registry = REGISTRY): WriteIntent[] {
  return registry.list
    .filter((tool) => tool.type !== 'read')
    .map((tool) => ({ name: tool.name, description: tool.description }));
}

/** The same list as bullets for the router prompt; empty list → empty string. */
export function writeIntentLines(registry: Registry = REGISTRY): string {
  return writeIntents(registry)
    .map((intent) => `- ${intent.name}: ${intent.description}`)
    .join('\n');
}
