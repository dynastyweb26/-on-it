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

/**
 * Payment deep link URL builders. User-supplied handles are sanitized using
 * domain/symbol stripping and encodeURIComponent to prevent URL parameter
 * injection, path traversal, or unescaped characters in deep links.
 */
export function cashAppUrl(tag: string): string {
  const clean = tag.trim().replace(/^(https?:\/\/)?(www\.)?cash\.app\/\$?/i, '').replace(/^\$+/, '').replace(/[/?#].*$/, '');
  return `https://cash.app/$${encodeURIComponent(clean)}`;
}

export function payPalUrl(handle: string): string {
  const clean = handle.trim().replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '').replace(/^[@/]+/, '').replace(/[/?#].*$/, '');
  return `https://paypal.me/${encodeURIComponent(clean)}`;
}

export function venmoUrl(handle: string): string {
  const clean = handle.trim().replace(/^(https?:\/\/)?(www\.)?venmo\.com\/(u\/)?/i, '').replace(/^[@/]+/, '').replace(/[/?#].*$/, '');
  return `https://venmo.com/u/${encodeURIComponent(clean)}`;
}
