// Full-page states for the public estimate page. Shared by the server page
// (unavailable, rate limited, load failed) and the client view (a link that
// becomes unavailable after a reload).
import EstIcon from './EstIcon';
import type { EstIconName } from './estimate-icon-names';
import s from './estimate.module.css';

export function Footer() {
  return (
    <footer className={s.footer}>
      Sent with On It
      <div className={s.footerLinks}>
        <a className={s.footerLink} href="/privacy">
          Privacy
        </a>
        <span aria-hidden>·</span>
        <a className={s.footerLink} href="/terms">
          Terms
        </a>
      </div>
    </footer>
  );
}

export function Notice({
  icon,
  title,
  body,
  children,
}: {
  icon: EstIconName;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={s.notice}>
      <div className={s.noticeTile}>
        <EstIcon name={icon} size={36} />
      </div>
      <h1 className={s.noticeTitle}>{title}</h1>
      <p className={s.noticeBody}>{body}</p>
      {children}
      <Footer />
    </div>
  );
}

/** The single answer for a missing, draft, revoked, deleted or converted link:
 *  it never says which one (spec §2.2). */
export function UnavailableNotice() {
  return (
    <Notice
      icon="link_off"
      title="This link isn't active anymore"
      body="The estimate may have been updated or withdrawn. Reach out to the business that sent it and they can send you a fresh link."
    />
  );
}
