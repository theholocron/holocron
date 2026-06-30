/**
 * libsodium sealed-box encryption for GitHub Actions secrets.
 *
 * GitHub stores Actions / Codespaces / Dependabot secrets encrypted
 * with a curve25519 public key (returned by the `/actions/secrets/public-key`
 * endpoint). Callers fetch that key, encrypt the plaintext value with
 * `crypto_box_seal`, then PUT the base64-encoded ciphertext + `key_id`.
 *
 * Reference: https://docs.github.com/en/rest/actions/secrets#create-or-update-a-repository-secret
 *
 * **Why createRequire?** `libsodium-wrappers@0.7.x` ships a broken
 * ESM bundle — the `dist/modules-esm/libsodium-wrappers.mjs` entry
 * imports a sibling `libsodium.mjs` that isn't included in the npm
 * tarball. Native `import` against the package therefore fails.
 * `createRequire` routes through Node's CJS resolver, which honors
 * the `"require"` condition in the package's exports map and loads
 * the self-contained CJS bundle instead. Same API, working module.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

interface SodiumLib {
  ready: Promise<void>
  from_base64(input: string, variant: number): Uint8Array
  to_base64(input: Uint8Array, variant: number): string
  from_string(input: string): Uint8Array
  to_string(input: Uint8Array): string
  crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array
  crypto_box_seal_open(
    ciphertext: Uint8Array,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Uint8Array
  crypto_box_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array; keyType: string }
  base64_variants: { ORIGINAL: number; ORIGINAL_NO_PADDING: number; URLSAFE: number }
}

const sodium = require('libsodium-wrappers') as SodiumLib

/**
 * Encrypt `value` for the given GitHub-provided base64 public key.
 * Returns the base64 ciphertext to send as `encrypted_value`.
 */
export async function encryptSecret(publicKeyBase64: string, value: string): Promise<string> {
  await sodium.ready
  const publicKey = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL)
  const plaintext = sodium.from_string(value)
  const ciphertext = sodium.crypto_box_seal(plaintext, publicKey)
  return sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL)
}

/** Re-exported for tests so they can use the SAME loaded sodium instance. */
export { sodium }
