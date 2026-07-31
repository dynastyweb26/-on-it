/* ═══ Minimal Markdown → token-styled JSX ═══
   Purpose-built for the legal documents (privacy-policy.md, terms-of-service.md).
   Handles exactly the constructs those files use — headings, paragraphs, bold,
   bullet lists, a GFM table, horizontal rules, links, bare URLs, emails — and
   renders them with the app's typography tokens (ON-IT-DESIGN-STANDARD). Server
   component: pure, no hooks, no client JS. Not a general Markdown engine. */
import React from 'react';

const external = (href: string) =>
  /^https?:\/\//.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {};

/** Inline pass: **bold**, [text](url), bare http(s) URLs, and emails. */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s)]+)|([\w.+-]+@[\w.-]+\.\w{2,})/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(<strong key={k++} className="font-semibold text-on-background">{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      parts.push(<a key={k++} href={m[3]} className="text-primary underline" {...external(m[3])}>{m[2]}</a>);
    } else if (m[4] !== undefined) {
      // Bare URL — pull any trailing sentence punctuation back out of the link.
      let url = m[4];
      let trail = '';
      while (/[.,;:)]$/.test(url)) { trail = url.slice(-1) + trail; url = url.slice(0, -1); }
      parts.push(<a key={k++} href={url} className="text-primary underline break-all" target="_blank" rel="noopener noreferrer">{url}</a>);
      if (trail) parts.push(trail);
    } else if (m[5] !== undefined) {
      parts.push(<a key={k++} href={`mailto:${m[5]}`} className="text-primary underline break-all">{m[5]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const splitRow = (line: string): string[] =>
  line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());

export default function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let key = 0;
  let i = 0;

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(
      <p key={key++} className="text-body-md leading-relaxed text-on-surface-variant break-words">
        {renderInline(para.join(' '))}
      </p>,
    );
    para = [];
  };

  while (i < lines.length) {
    const t = lines[i].trim();

    if (t === '') { flushPara(); i++; continue; }

    if (t === '---') { flushPara(); blocks.push(<hr key={key++} className="my-6 border-outline-variant/50" />); i++; continue; }

    const h = /^(#{1,3})\s+(.*)$/.exec(t);
    if (h) {
      flushPara();
      const content = renderInline(h[2]);
      if (h[1].length === 1) blocks.push(<h1 key={key++} className="font-display text-headline-lg text-on-background">{content}</h1>);
      else if (h[1].length === 2) blocks.push(<h2 key={key++} className="mt-8 font-display text-headline-mobile text-on-background">{content}</h2>);
      else blocks.push(<h3 key={key++} className="mt-6 font-display text-body-lg font-semibold text-on-background">{content}</h3>);
      i++; continue;
    }

    // GFM table: a pipe row immediately followed by a |---| separator row.
    if (t.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      flushPara();
      const header = splitRow(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitRow(lines[i].trim())); i++; }
      blocks.push(
        <div key={key++} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>{header.map((c, ci) => <th key={ci} className="border border-outline-variant/50 bg-surface-container px-3 py-2 text-left font-semibold text-on-background">{renderInline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-outline-variant/50 px-3 py-2 align-top text-on-surface-variant">{renderInline(c)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, '')); i++; }
      blocks.push(
        <ul key={key++} className="ml-5 list-disc space-y-1.5 text-body-md leading-relaxed text-on-surface-variant marker:text-outline">
          {items.map((it, ii) => <li key={ii} className="break-words">{renderInline(it)}</li>)}
        </ul>,
      );
      continue;
    }

    para.push(t);
    i++;
  }
  flushPara();

  return <>{blocks}</>;
}
