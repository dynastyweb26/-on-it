// Settings sub-screens (release frames 0c): /settings/<section>. Same server
// wrapper as /settings (the Stripe Connect switch is read here, at request
// time), rendering one section of SettingsView.
import { notFound } from 'next/navigation';
import { connectEnabled } from '@/lib/stripe/connect';
import SettingsView from '../SettingsView';
import { SETTINGS_SECTIONS, type SettingsSection } from '../sections';

export const dynamic = 'force-dynamic';

export default function SettingsSectionPage({ params }: { params: { section: string } }) {
  const section = params.section as SettingsSection;
  if (section === 'main' || !SETTINGS_SECTIONS.includes(section)) notFound();
  const enabled = connectEnabled() && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  return <SettingsView connectEnabled={enabled} section={section} />;
}
