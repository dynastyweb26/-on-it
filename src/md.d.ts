// Raw-string imports of Markdown files (see the webpack asset/source rule in
// next.config.mjs). Used to render the legal pages from their source .md.
declare module '*.md' {
  const content: string;
  export default content;
}
