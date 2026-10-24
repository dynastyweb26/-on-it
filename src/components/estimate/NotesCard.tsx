'use client';

// Notes & terms (design spec §2.1.6): preserved line breaks, 4-line clamp,
// Read more / Show less. Hidden entirely when there are no notes.
import { useState } from 'react';
import EstIcon from './EstIcon';
import s from './estimate.module.css';

export default function NotesCard({ notes }: { notes: string }) {
  const [open, setOpen] = useState(false);

  return (
    <section className={s.card} aria-label="Notes and terms">
      <div className={s.sectionHead}>
        <span className={s.sectionTitle}>Notes &amp; terms</span>
      </div>
      <p className={`${s.notesText} ${open ? '' : s.clamp4}`}>{notes}</p>
      <button type="button" className={s.textButton} onClick={() => setOpen((v) => !v)}>
        {open ? 'Show less' : 'Read more'}
        <EstIcon name="expand_more" size={18} />
      </button>
    </section>
  );
}
