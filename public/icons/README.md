# On It — App Icon Set

Final icon (decided July 2026): white/glossy gold thumbs-up, "ON IT!" wordmark
baked into the art. Do not regenerate — see ON-IT-DESIGN-STANDARD.md §10.

## Files
- `icon-1024.png` — App Store listing / marketing / source master
- `icon-512.png`, `icon-192.png` — PWA manifest (`public/manifest.json`)
- `icon-180.png` — iOS `apple-touch-icon`
- `icon-152.png` — iOS legacy touch icon
- `icon-144.png` — Android/Windows tile
- `icon-128.png` — Chrome Web Store listing
- `icon-96.png`, `icon-72.png` — Android launcher densities
- `icon-48.png`, `icon-32.png`, `icon-16.png` — favicon sizes
- `favicon.ico` — multi-resolution favicon (16/32/48/64/128/256)

## Where these go in the repo
Drop the whole folder's contents into `public/icons/`, then:

**`public/manifest.json`** — add/update the icons array:
```json
"icons": [
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
]
```

**`app/layout.tsx`** metadata (Next.js App Router):
```ts
export const metadata: Metadata = {
  icons: {
    icon: [
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/icons/icon-180.png',
  },
};
```

**`favicon.ico`** — place at `app/favicon.ico` (Next.js App Router serves this
automatically from the app directory root).

## Note on background
The icon has a white/glossy background baked in — do not place it on another
white or cream surface without a separating edge (border, shadow, or ring), or
its edges disappear. See the splash screen spec in the design standard for the
in-app treatment.
