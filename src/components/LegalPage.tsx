// Shared shell for the public legal pages (/terms, /privacy). Reachable without
// a session — these routes live outside the (app) group and have no auth guard.
// The document's own "# Title" and "**Last updated**" lines render at the top,
// so the date is visible immediately.
import Link from 'next/link';
import Markdown from '@/components/Markdown';

export default function LegalPage({ source }: { source: string }) {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="font-display text-lg font-extrabold text-on-background">
          On It<span className="text-primary">.</span>
        </Link>
        <Link href="/chat" className="text-sm text-on-surface-variant underline">Back to app</Link>
      </header>
      <article className="space-y-3">
        <Markdown source={source} />
      </article>
    </main>
  );
}
