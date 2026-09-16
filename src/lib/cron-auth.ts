import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Validates CRON_SECRET for incoming scheduled cron jobs.
 * Fails closed when CRON_SECRET is unconfigured or empty string (preventing auth bypass),
 * and uses constant-time comparison to protect against timing attacks.
 */
export function verifyCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secret.trim()) return false;

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;

  const expectedHeader = `Bearer ${secret}`;

  const bufActual = Buffer.from(authHeader);
  const bufExpected = Buffer.from(expectedHeader);

  if (bufActual.length !== bufExpected.length) return false;

  return timingSafeEqual(bufActual, bufExpected);
}
