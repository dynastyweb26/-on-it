// Settings screens: 'main' is /settings (the grouped rows); the rest are
// /settings/<section> sub-screens.
export const SETTINGS_SECTIONS = ['main', 'bank', 'business', 'business-info', 'business-brand', 'payouts', 'plan', 'notifications', 'help', 'login'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

// The section a path names — the laptop split's right pane. One level only:
// /settings/<section>. Everything else answers null, the same set the route
// accepts (see [section]/page.tsx): /settings, 'main' and a deeper route
// (/settings/payouts/<method>, /settings/plan/cancel) are not sections here.
export function sectionFromPath(pathname: string): SettingsSection | null {
  const m = /^\/settings\/([^/]+)$/.exec(pathname);
  if (!m) return null;
  const s = m[1] as SettingsSection;
  return s !== 'main' && SETTINGS_SECTIONS.includes(s) ? s : null;
}
