import 'server-only';
import { ImageResponse } from 'next/og';
import { loadPublicEstimate } from '@/lib/estimates/public';

// The thumbnail a messaging app shows when an estimate link is shared. Business
// name and a plain call to action only: the token is a bearer secret, so no
// amounts, client name or line items go into an image a chat app will cache.

export const runtime = 'nodejs';
export const alt = 'Estimate';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const FALLBACK_BRAND = '#1A1A1A';

function safeColor(value: string | undefined): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : FALLBACK_BRAND;
}

export default async function Image({ params }: { params: { token: string } }) {
  let business: string | null = null;
  let brand = FALLBACK_BRAND;
  try {
    const result = await loadPublicEstimate(params.token);
    if (result.state !== 'unavailable') {
      business = result.business.name?.trim() || null;
      brand = safeColor(result.business.brandColors?.[0]);
    }
  } catch { /* generic card */ }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#FBF8F1',
          borderLeft: `32px solid ${brand}`,
          color: '#1A1A1A',
        }}
      >
        <div style={{ fontSize: 40, letterSpacing: 6, textTransform: 'uppercase', color: '#6B6558' }}>
          Estimate
        </div>
        <div style={{ fontSize: 84, fontWeight: 700, marginTop: 24, lineHeight: 1.1 }}>
          {business ?? 'Your estimate'}
        </div>
        <div style={{ fontSize: 38, marginTop: 40, color: '#6B6558' }}>
          Tap to review and approve
        </div>
      </div>
    ),
    size,
  );
}
