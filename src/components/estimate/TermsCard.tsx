// Terms and conditions, at the bottom of the public estimate page. Shown in
// full (never clamped: it is the contract text). Renders nothing when there
// are no terms, so there is never an empty heading.
import s from './estimate.module.css';

export default function TermsCard({ terms }: { terms: string | null }) {
  if (!terms) return null;
  return (
    <section className={s.card} aria-label="Terms and conditions">
      <div className={s.sectionHead}>
        <span className={s.sectionTitle}>Terms &amp; conditions</span>
      </div>
      <p className={s.notesText}>{terms}</p>
    </section>
  );
}
