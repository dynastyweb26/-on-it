// `npm test`: runs src/**/*.test.ts on Node's built-in test runner with its
// TypeScript type stripping (Node ≥ 22.18). No test framework dependency.
// This hook only teaches Node the two things the app's bundler does for it:
// the `@/` alias (tsconfig paths → src/) and extensionless relative imports.
// Tests can therefore import only pure modules (no `server-only`, no React).
import { register } from 'node:module';

register(new URL('./test-loader.mjs', import.meta.url));
