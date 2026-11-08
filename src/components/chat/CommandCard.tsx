'use client';

// Item 11: the "What I can do" card. A LOCAL assistant card (RULES): its rows
// are a constant, it is never an event, and it never reaches /api/parse.
//
// Anatomy from spec 08: a title, one line that says what to do with it, then
// groups of rows. A row is a name plus the phrase it will drop into the
// composer — tapping the row is a start, never a send.
export interface CommandRow {
  name: string;
  /** The phrase the row puts in the composer, caret at the end. */
  ex: string;
}

export interface CommandGroup {
  title: string;
  items: CommandRow[];
}

export default function CommandCard({
  groups,
  onPick,
  className = '',
}: {
  groups: CommandGroup[];
  onPick: (phrase: string) => void;
  className?: string;
}) {
  return (
    <div className={`w-full rounded-2xl border border-outline-variant/60 bg-surface-container px-3 py-3 ${className}`}>
      <p className="px-1 font-display text-[18px] font-extrabold leading-tight text-on-background">What I can do</p>
      <p className="mb-2 px-1 text-[13px] leading-snug text-on-surface-variant">Tap one to start. Edit it, then send.</p>
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-1 pb-1 text-[10.5px] font-bold uppercase tracking-[.08em] text-on-surface-variant/80">
              {group.title}
            </p>
            <div className="flex flex-col">
              {group.items.map((item) => (
                <button
                  key={`${group.title}:${item.name}`}
                  type="button"
                  onClick={() => onPick(item.ex)}
                  className="flex flex-col items-start rounded-xl px-2 py-1.5 text-left transition active:bg-primary-container/70"
                >
                  <span className="text-[14px] font-semibold leading-snug text-on-surface">{item.name}</span>
                  <span className="text-[12.5px] leading-snug text-on-surface-variant">{item.ex}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
