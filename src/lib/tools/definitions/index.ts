// ═══ AI Smart · one entry per tool file ═══
//
// Every tool lives in its own file in this folder and is exported here. The
// registry builds from this list and refuses to load if any definition is
// incomplete, so adding a file is the only way to add a tool.
import type { ToolDefinition } from '../contract';
import { unpaidTool } from './unpaid';

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [unpaidTool];
