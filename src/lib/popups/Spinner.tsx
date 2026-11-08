// The kit's one spinner (PopSheet / PopInline busy buttons). Lifted from the
// board: a 2px ring in muted ink with its top arc cut away.
export default function Spinner({ tone = 'muted', size = 16 }: { tone?: 'muted' | 'dark'; size?: number }) {
  return (
    <span
      aria-hidden
      className="shrink-0 animate-spin rounded-full"
      style={{
        width: size,
        height: size,
        border: `2px solid ${tone === 'dark' ? '#3a352d' : '#8f8676'}`,
        borderTopColor: 'transparent',
        boxSizing: 'border-box',
      }}
    />
  );
}
