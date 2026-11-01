// The only way the four interactive Plaid routes answer a non-2xx: one stable
// log line, then the JSON body. Keeping it here (not in each route) is what
// makes "every failure is explainable, and never logs a secret" testable — the
// failure test scans the route files for any other 4xx/5xx response.
import { NextResponse } from 'next/server';
import { failure, type FailureKind, type PlaidRoute } from './failure';

export function fail(route: PlaidRoute, kind: FailureKind, detail?: string | null): NextResponse {
  const f = failure(route, kind, detail);
  // A string, so a stray object can never dump a request body or token.
  console.error(f.line);
  return NextResponse.json(f.body, { status: f.status });
}
