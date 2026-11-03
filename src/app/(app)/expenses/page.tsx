'use client';
// Expenses is the left page of the Expenses | Income pair.
import LedgerPair from '@/components/ledger/LedgerPair';

export default function ExpensesPage() {
  return <LedgerPair initial="expenses" />;
}
