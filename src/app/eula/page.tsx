import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import source from '../../../eula.md';

export const metadata: Metadata = { title: 'End User License Agreement — On It' };

export default function EulaPage() {
  return <LegalPage source={source} />;
}
