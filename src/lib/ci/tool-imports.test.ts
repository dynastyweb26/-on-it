// The service-role check is only useful if it catches the helper loophole, so
// the test builds a small project tree with a clean tool, a direct offender and
// an indirect one, and asserts exactly which are reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findServiceRoleReach } from '../../../scripts/ci/tool-imports';

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'tools-imports-'));
  for (const [path, source] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, source);
  }
  return root;
}

test('a tool that never touches the service role is clean', () => {
  const root = project({
    'src/lib/tools/definitions/clean.ts': "import { z } from 'zod';\nexport const x = z;\n",
    'src/lib/supabase/admin.ts': 'export const adminClient = () => null;\n',
  });
  try {
    assert.deepEqual(findServiceRoleReach(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a direct import of adminClient is reported', () => {
  const root = project({
    'src/lib/tools/definitions/direct.ts':
      "import { adminClient } from '@/lib/supabase/admin';\nexport const x = adminClient;\n",
    'src/lib/supabase/admin.ts': 'export const adminClient = () => null;\n',
  });
  try {
    const reaches = findServiceRoleReach(root);
    assert.equal(reaches.length, 1);
    assert.equal(reaches[0].from, 'src/lib/tools/definitions/direct.ts');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the helper loophole is reported, with the path it took', () => {
  const root = project({
    'src/lib/tools/definitions/indirect.ts': "import { readRows } from '../rows';\nexport const x = readRows;\n",
    'src/lib/tools/rows.ts': "import { adminClient } from '@/lib/supabase/admin';\nexport const readRows = adminClient;\n",
    'src/lib/supabase/admin.ts': 'export const adminClient = () => null;\n',
  });
  try {
    const reaches = findServiceRoleReach(root);
    // The helper itself is scanned too (it lives under src/lib/tools), so the
    // loophole is reported twice: once from the tool, once from the helper.
    const fromTool = reaches.find((reach) => reach.from === 'src/lib/tools/definitions/indirect.ts');
    assert.ok(fromTool, 'the tool that reaches admin through a helper is reported');
    assert.deepEqual(fromTool.via, [
      'src/lib/tools/definitions/indirect.ts',
      'src/lib/tools/rows.ts',
      'src/lib/supabase/admin.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('package imports are not mistaken for project files', () => {
  const root = project({
    'src/lib/tools/definitions/pkg.ts': "import { z } from 'zod';\nimport 'server-only';\nexport const x = z;\n",
  });
  try {
    assert.deepEqual(findServiceRoleReach(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
