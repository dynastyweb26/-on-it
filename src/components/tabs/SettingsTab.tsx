'use client';
// The Settings tab already had a separate client view (the route is a server
// wrapper that reads the Stripe Connect switch). This is the deck's entry
// point: the same view, pinned to the main section, so a tab render and a
// direct /settings load cannot drift.
import SettingsView from '@/app/(app)/settings/SettingsView';

export default function SettingsTab({ connectEnabled, active = true }: { connectEnabled: boolean; active?: boolean }) {
  return <SettingsView connectEnabled={connectEnabled} section="main" active={active} />;
}
