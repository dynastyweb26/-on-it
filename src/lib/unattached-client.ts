// The chat card's calls to /api/income/unattached (POST save, DELETE remove,
// PATCH restore) and the plain wording for every way they can fail. Pure apart
// from the injected fetch, so the wording and the "failed is never saved" rule
// are unit-tested. There is no offline queue on this path: a request that did
// not reach the server is reported as failed, never as saved.

export type UnattachedCallResult = { ok: true; id: string } | { ok: false; message: string };

/** What the user reads for each status / server code. */
export function unattachedErrorMessage(status: number | null, code?: string | null): string {
  if (status === null) return 'No connection. Nothing was saved.';
  if (status === 401 || code === 'unauthorized') return 'Sign in to record a payment.';
  if (status === 429 || code === 'rate_limited') return 'Too many tries. Wait a minute, then try again.';
  switch (code) {
    case 'amount_invalid': return 'Enter an amount above $0 and up to $9,999,999.99.';
    case 'method_invalid': return 'Pick how they paid.';
    case 'date_invalid': return "That date isn't valid. Pick another.";
    case 'title_too_long': return 'Keep the name to 200 characters or fewer.';
    case 'not_allowed': return "You're not allowed to record this payment.";
    case 'duplicate_submission': return 'This was already saved with different details. Check your payments before trying again.';
    case 'not_found': return 'That payment is already gone.';
  }
  if (status === 403) return "You're not allowed to record this payment.";
  if (status === 409) return 'This was already saved with different details. Check your payments before trying again.';
  return 'Something went wrong on our side. Nothing was saved. Try again.';
}

export async function callUnattached(
  method: 'POST' | 'DELETE' | 'PATCH',
  body: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<UnattachedCallResult> {
  let res: Response;
  try {
    res = await fetchFn('/api/income/unattached', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: unattachedErrorMessage(null) };
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string } | null;
  // Saved only when the server says so: a 200 with no id is a failure too.
  if (res.ok && json?.ok === true && typeof json.id === 'string') return { ok: true, id: json.id };
  return { ok: false, message: unattachedErrorMessage(res.status, json?.error) };
}
