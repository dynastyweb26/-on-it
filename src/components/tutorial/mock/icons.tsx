// The app's icon subset is intentionally not modified. These are the few
// prototype glyphs it does not contain, drawn at the same 24-unit grid.

export function SignalIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="15" width="3.4" height="6" rx="1.5" />
      <rect x="8.2" y="11" width="3.4" height="10" rx="1.5" />
      <rect x="13.4" y="7" width="3.4" height="14" rx="1.5" />
      <rect x="18.6" y="3" width="3.4" height="18" rx="1.5" />
    </svg>
  );
}

export function WifiIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.5 8.8a13 13 0 0 1 17 0M6.8 12.3a8.5 8.5 0 0 1 10.4 0M10.1 15.7a4 4 0 0 1 3.8 0"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="19.1" r="1.45" fill="currentColor" />
    </svg>
  );
}

export function BookmarkIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

export function DrawIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19.5h4.2L19.4 8.3a2.1 2.1 0 0 0-3-3L5.2 16.5 4 19.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m14.8 6.8 2.9 2.9M4.5 19.5l3.8-.9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
