// Consent copy for the e-signature. Version 1 is frozen: any wording change is
// a NEW version, never an edit to this string. The public GET returns this
// exact text so the page renders what gets recorded, and sign_estimate stores
// the same text plus the version with the signature.
export const CONSENT_VERSION = '1' as const;

export const CONSENT_V1 =
  'I agree to this estimate and to sign electronically. By approving, you agree to sign this estimate electronically.';

export const CONSENT = { text: CONSENT_V1, version: CONSENT_VERSION } as const;
