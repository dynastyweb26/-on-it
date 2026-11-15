// A tool's card row names an icon; a name missing from ICON_NAMES renders as
// its literal ligature text on the card ("inventory_2"), which is a visible bug.
// This reads the definitions as text — the same way the app's own font build
// does — so a new tool cannot ship an icon the font does not contain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ICON_NAMES } from '@/components/icon-names';

const DIR = 'src/lib/tools/definitions';

test('every icon a tool row names is in the icon font', () => {
  const names = new Set<string>(ICON_NAMES);
  const files = readdirSync(DIR).filter((name) => name.endsWith('.ts') && !name.includes('.test.'));
  const seen = new Map<string, string>();
  for (const file of files) {
    const source = readFileSync(join(DIR, file), 'utf8');
    for (const match of source.matchAll(/\bicon:\s*'([a-z0-9_]+)'/g)) {
      seen.set(match[1], file);
    }
  }
  assert.ok(seen.size > 0, 'the definitions name at least one icon');
  const missing = [...seen].filter(([icon]) => !names.has(icon));
  assert.deepEqual(
    missing,
    [],
    `missing from src/components/icon-names.ts: ${missing.map(([icon, file]) => `${icon} (${file})`).join(', ')}`,
  );
});

test('the two icons save_item and the edit tools use are in the font', () => {
  assert.ok(ICON_NAMES.includes('inventory_2'));
  assert.ok(ICON_NAMES.includes('edit_note'));
});
