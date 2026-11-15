// One fallback phrase per write tool the registry has. The fallback itself has
// no registry import (it must stay browser-safe), so the registry is loaded HERE,
// in test data: write-tool-phrases.test.ts fails when a registered write or send
// tool has no phrase, which is how a new tool keeps the fallback in sync.
//
// A phrase must be something a person would say, and it must route to ask.
export const WRITE_TOOL_PHRASES: Record<string, string> = {
  create_client: 'add Ruth Lawrence as a client, 555-0100',
  edit_client: "update Maria's email to m@x.com",
  save_item: 'save service call at 95',
  edit_expense: 'change the Home Depot expense to Tools',
  delete_expense: 'delete the Home Depot expense',
  delete_draft: 'delete draft 6',
  edit_document_details: "change Smith's due date to the 12th",
};
