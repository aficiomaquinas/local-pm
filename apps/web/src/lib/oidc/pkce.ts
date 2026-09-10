/**
 * SPC-006 §5 — Authorization Code + PKCE (S256) primitives.
 *
 * Pure helpers for the Next route handlers: code_verifier generation
 * (RFC 7636 §4.1: 43–128 chars from the unreserved set), S256
 * code_challenge (BASE64URL-ENCODE(SHA256(ASCII(code_verifier))), RFC 7636
 * §4.2), plus cryptographically random `state` (CSRF) and `nonce`
 * (replay). OAuth 2.1 makes PKCE mandatory for the code flow [R5][R10].
 */

import { createHash, randomBytes } from 'node:crypto'

const VERIFIER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

/** RFC 7636 §4.1 code_verifier: 43–128 chars, unreserved alphabet. */
export function generateCodeVerifier(length = 64): string {
  if (length < 43 || length > 128) throw new Error('code_verifier length must be 43..128')
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += VERIFIER_ALPHABET[bytes[i] % VERIFIER_ALPHABET.length]
  }
  return out
}

/** S256 challenge: BASE64URL(SHA256(verifier)) with padding stripped. */
export function generateCodeChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

/** Random `state` (CSRF token, §5). */
export function generateState(): string {
  return randomBytes(24).toString('base64url')
}

/** Random `nonce` (bound into the ID token, §5 [R8]). */
export function generateNonce(): string {
  return randomBytes(24).toString('base64url')
}
