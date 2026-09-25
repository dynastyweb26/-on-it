// Shared website-href normalization. Profiles store the website exactly as the
// user typed it ("vtcprojects.com", "www.x.com", "http://x.com", "https://x.com/");
// the DB no longer format-validates it (003_relax_website_check). This turns that
// raw value into a valid link href AT RENDER TIME only — the stored value and the
// displayed text are never changed.
//
//   - empty / whitespace        → null  (caller renders no link)
//   - starts with http:// / https:// → returned unchanged (case-insensitive)
//   - anything else (bare domain, www.) → prefixed with https://
export function websiteHref(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

// Handle → deep link normalization for payment methods (Cash App, PayPal, Venmo).
// Strips pasted domain/protocol prefixes and leading symbols (@, $, /), then
// applies encodeURIComponent to protect against path traversal or parameter
// injection in generated payment URLs.

export function cashAppUrl(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const clean = tag.replace(/^(https?:\/\/)?(www\.)?cash\.app\//i, '').replace(/^[@/$]+/, '').trim();
  return clean ? `https://cash.app/$${encodeURIComponent(clean)}` : null;
}

export function payPalUrl(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const clean = handle.replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '').replace(/^[@/]+/, '').trim();
  return clean ? `https://paypal.me/${encodeURIComponent(clean)}` : null;
}

export function venmoUrl(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const clean = handle.replace(/^(https?:\/\/)?(www\.)?venmo\.com\/(u\/)?/i, '').replace(/^[@/]+/, '').trim();
  return clean ? `https://venmo.com/u/${encodeURIComponent(clean)}` : null;
}
