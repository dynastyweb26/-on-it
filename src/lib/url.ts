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
