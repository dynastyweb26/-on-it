// ═══ CI · no service role in a tool, directly or through a helper ═══
//
// A tool runs the model's request under the owner's session. The service-role
// client bypasses RLS, so one careless import turns "the model proposed a read
// of my rows" into "the model can read anyone's rows". This check fails the
// build if any file under src/lib/tools reaches src/lib/supabase/admin.ts,
// following imports through local helpers (a helper that imports adminClient is
// exactly the loophole this exists to close).
//
// Usage:
//   node --import ./scripts/test-register.mjs scripts/ci/tool-imports.ts
//   node --import ./scripts/test-register.mjs scripts/ci/tool-imports.ts <root>
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ADMIN_MODULE = 'src/lib/supabase/admin';
export const TOOLS_DIR = 'src/lib/tools';
/** The module that builds a WriteDb. Only /api/ai/confirm may import it. */
export const WRITE_DB_MODULE = 'src/lib/tools/write-db';

export type Reach = { from: string; via: string[] };

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^;]*?from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir: string, out: string[] = []): string[] {
  // A start directory can be absent in a small fixture; that is nothing to scan,
  // not a crash.
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every module specifier a file imports, in source order. */
export function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1] ?? match[2];
    if (specifier) found.push(specifier);
  }
  return found;
}

/** Resolve an import to a project file, or null when it leaves the project. */
export function resolveImport(root: string, fromFile: string, specifier: string): string | null {
  const candidates: string[] = [];
  if (specifier.startsWith('@/')) {
    candidates.push(join(root, 'src', specifier.slice(2)));
  } else if (specifier.startsWith('.')) {
    candidates.push(resolve(dirname(fromFile), specifier));
  } else {
    return null; // a package, or node built-in
  }

  for (const base of candidates) {
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        /* not this one */
      }
    }
  }
  return null;
}

/** Walk the import graph from each start file to one forbidden module. */
export function findReach(
  root: string,
  starts: readonly string[],
  target: string,
): Reach[] {
  const targetFile = join(root, `${target}.ts`);
  const reaches: Reach[] = [];

  const visit = (file: string, trail: string[], seen: Set<string>): string[] | null => {
    if (resolve(file) === resolve(targetFile)) return [...trail, file];
    if (seen.has(file)) return null;
    seen.add(file);

    for (const specifier of importsOf(file)) {
      const next = resolveImport(root, file, specifier);
      if (!next) continue;
      const found = visit(next, [...trail, file], seen);
      if (found) return found;
    }
    return null;
  };

  for (const file of starts) {
    const trail = visit(file, [], new Set());
    if (trail) {
      reaches.push({
        from: relative(root, file),
        via: trail.map((entry) => relative(root, entry)),
      });
    }
  }
  return reaches;
}

/**
 * Walk the import graph from each file under src/lib/tools and report every
 * path that reaches the service-role module.
 */
export function findServiceRoleReach(root: string): Reach[] {
  return findReach(root, walk(join(root, TOOLS_DIR)), ADMIN_MODULE);
}

/**
 * The write database is a privilege, not a building block: only /api/ai/confirm
 * constructs one. This fails if the model turn or any read tool can even import
 * the module that builds it, so "execute" can never be reached from a turn.
 */
export function findWriteDbReach(root: string): Reach[] {
  const starts = [
    join(root, TOOLS_DIR, 'turn.ts'),
    ...walk(join(root, TOOLS_DIR, 'definitions')),
  ];
  return findReach(root, starts, WRITE_DB_MODULE);
}

function report(label: string, reaches: readonly Reach[], ok: string): number {
  if (reaches.length === 0) {
    console.log(`[tools-safety] ${ok}`);
    return 0;
  }
  console.error(`[tools-safety] ${label}`);
  for (const reach of reaches) {
    console.error(`  ${reach.from}`);
    for (const hop of reach.via) console.error(`    -> ${hop}`);
  }
  return 1;
}

function main(root: string): number {
  const admin = report(
    'a tool can reach the service-role client:',
    findServiceRoleReach(root),
    'no tool reaches adminClient',
  );
  const write = report(
    'the model turn or a read tool can reach the write database:',
    findWriteDbReach(root),
    'no turn or read tool reaches the write database',
  );
  return Math.max(admin, write);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
  process.exit(main(root));
}
