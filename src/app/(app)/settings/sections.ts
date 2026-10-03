// Settings screens: 'main' is /settings (the grouped rows); the rest are
// /settings/<section> sub-screens.
export const SETTINGS_SECTIONS = ['main', 'business', 'payouts'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
