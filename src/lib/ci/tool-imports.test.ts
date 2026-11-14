// The service-role check is only useful if it catches the helper loophole, so
// the test builds a small project tree with a clean tool, a direct offender and
// an indirect one, and asserts exactly which are reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findServiceRoleReach, findWriteDbReach } from '../../../scripts/ci/tool-imports';

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

test('the write database is unreachable from the turn and from a read tool', () => {
  const root = project({
    'src/lib/tools/turn.ts': "import { supabaseWriteDb } from './write-db';\nexport const x = supabaseWriteDb;\n",
    'src/lib/tools/write-db.ts': 'export const supabaseWriteDb = () => null;\n',
  });
  try {
    const reaches = findWriteDbReach(root);
    assert.deepEqual(reaches.map((reach) => reach.from), ['src/lib/tools/turn.ts']);
    assert.deepEqual(reaches[0].via, ['src/lib/tools/turn.ts', 'src/lib/tools/write-db.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a read tool that reaches the write database, directly or through a helper', () => {
  const root = project({
    'src/lib/tools/turn.ts': 'export const turn = () => null;\n',
    'src/lib/tools/definitions/tool.ts': "import { writeHandle } from '../helper';\nexport const x = writeHandle;\n",
    'src/lib/tools/helper.ts': "import { supabaseWriteDb } from './write-db';\nexport const writeHandle = supabaseWriteDb;\n",
    'src/lib/tools/write-db.ts': 'export const supabaseWriteDb = () => null;\n',
  });
  try {
    const reaches = findWriteDbReach(root);
    const fromTool = reaches.find((reach) => reach.from === 'src/lib/tools/definitions/tool.ts');
    assert.ok(fromTool, 'a read tool reaching the write db through a helper is reported');
    assert.deepEqual(fromTool.via, [
      'src/lib/tools/definitions/tool.ts',
      'src/lib/tools/helper.ts',
      'src/lib/tools/write-db.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the confirm route may build a write context: only tools are scanned for it', () => {
  const root = project({
    'src/lib/tools/turn.ts': 'export const turn = () => null;\n',
    'src/lib/tools/write-db.ts': 'export const supabaseWriteDb = () => null;\n',
    'src/app/api/ai/confirm/route.ts':
      "import { supabaseWriteDb } from '@/lib/tools/write-db';\nexport const route = supabaseWriteDb;\n",
  });
  try {
    assert.deepEqual(findWriteDbReach(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
