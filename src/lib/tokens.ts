import { randomBytes } from 'node:crypto';

/**
 * Secret for a guest's personal link: 144 random bits (base64url, 24 chars).
 * Unlike cuid(), not derived from a timestamp / counter, so not guessable.
 */
export function newGuestToken(): string {
  return randomBytes(18).toString('base64url');
}
