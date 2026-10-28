import 'server-only';
import type { Metadata } from 'next';
import { headers } from 'next/headers';

// ─────────────────────────────────────────────────────────────────────────
// Shared <head> for the two PUBLIC bearer-token pages (/e/<token> and
// /pay/<token>).
//
// One static thumbnail for every shared document link: the On It app icon on
// brand gold (/og-onit.png). Deliberately NOT per-business and NOT generated —
// a chat app caches what it unfurls, and a distinct image per token meant a
// render (and a Supabase round trip) on every crawl. Title and description stay
// dynamic per business.
// ─────────────────────────────────────────────────────────────────────────

export const OG_IMAGE = {
  url: '/og-onit.png',
  width: 1200,
  height: 630,
  alt: 'On It',
} as const;

/** Metadata for a public document page. `metadataBase` comes from the request
 *  host, so og:image / twitter:image resolve to an absolute URL (a relative one
 *  is ignored by the unfurlers) on every deployment, preview included. */
/** Same icon set as the root layout (src/app/layout.tsx): a public document
 *  page supplies its own metadata, and without this the tab fell back to the
 *  browser grey globe. */
export const PUBLIC_ICONS: Metadata["icons"] = {
  icon: [
    { url: "/icons/favicon.ico", sizes: "16x16 32x32 48x48" },
    { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
  ],
  apple: "/icons/apple-icon-180.png",
};

export async function publicDocMetadata({
  title,
  description,
}: {
  title: string;
  description: string;
}): Promise<Metadata> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return {
    ...(host ? { metadataBase: new URL(`${proto}://${host}`) } : {}),
    title,
    description,
    // Bearer-token links must never be indexed.
    robots: { index: false, follow: false },
    icons: PUBLIC_ICONS,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
