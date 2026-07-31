import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import source from '../../../privacy-policy.md';

export const metadata: Metadata = { title: 'Privacy Policy — On It' };

export default function PrivacyPage() {
  return <LegalPage source={source} />;
}
