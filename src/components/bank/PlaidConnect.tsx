'use client';
// The official react-plaid-link hook, rendered only when the Connect button
// received a real link token from the preview-only route. It opens Plaid's own
// sheet and hands the public token back; everything else on the Bank accounts
// screen stays the mock sequence.
import { useEffect } from 'react';
import {
  usePlaidLink, type PlaidLinkError, type PlaidLinkOnSuccessMetadata,
} from 'react-plaid-link';

export default function PlaidConnect({ token, onPublicToken, onExit, onError }: {
  token: string;
  onPublicToken: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit: () => void;
  onError: (message: string) => void;
}) {
  const { open, ready, error } = usePlaidLink({
    token,
    onSuccess: (publicToken, metadata) => {
      if (publicToken) onPublicToken(publicToken, metadata);
      else onError('Plaid did not return a token. Try again.');
    },
    onExit: (plaidError: PlaidLinkError | null) => {
      if (plaidError) onError(plaidError.display_message || 'We couldn’t open your bank. Try again.');
      else onExit();
    },
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  useEffect(() => {
    if (error) onError('We couldn’t open your bank. Try again.');
  }, [error, onError]);

  return null;
}
