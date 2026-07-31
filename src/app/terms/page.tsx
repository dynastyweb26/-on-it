import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import source from '../../../terms-of-service.md';

export const metadata: Metadata = { title: 'Terms of Service — On It' };

export default function TermsPage() {
  return <LegalPage source={source} />;
}
