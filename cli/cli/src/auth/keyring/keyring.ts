/**
 * Keyring-backed bootstrap credential store.
 *
 * Every holocron plugin's bootstrap token (the one it needs before it can talk to its vendor's API) can be stored in
 * the OS keyring under a single reverse-DNS service scope. Managed via `holocron auth` subcommands; consulted at
 * position 4 in every plugin's auth precedence chain (after --token / HOLOCRON_<X>_TOKEN / <native>_TOKEN).
 *
 * The keyring itself, with its best-effort failure model and its per-process cache, is `createKeyring` in
 * `@theholocron/kyber/secrets`; this file only names the service and keeps the function names the CLI uses.
 *
 * See `docs/wiki/specifications/tech-auth-bootstrap.spec.md` for the design rationale.
 */

import { Entry, findCredentials } from "@napi-rs/keyring";
import { createKeyring } from "@theholocron/kyber/secrets";

// The binding is passed in, not left to kyber to load, because this package depends on `@napi-rs/keyring` itself.
const keyring = createKeyring({ service: "com.theholocron.cli", binding: { Entry, findCredentials } });

/**
 * Forget every token `getToken` has remembered, so the next read asks the keyring again. For a test, or after the
 * keyring was changed from outside the process.
 */
export function clearTokenCache(): void {
	keyring.clearCache();
}

/** Store or overwrite a bootstrap token for a provider. Returns true on success, false when the keyring is unsupported or errored. */
export function setToken(provider: string, token: string): boolean {
	return keyring.set(provider, token);
}

/**
 * Read the bootstrap token for a provider. Returns `null` for both "not stored" and "keyring unavailable", so callers
 * fall through to env-var precedence. The answer is remembered for the rest of the process.
 */
export function getToken(provider: string): string | null {
	return keyring.get(provider);
}

/**
 * Whether the OS keyring can be used at all. `getToken` answers `null` for a missing entry and for a keyring that
 * cannot be reached alike; a caller that must tell an outage from an empty keyring asks this first.
 */
export function isKeyringAvailable(): boolean {
	return keyring.isAvailable();
}

/** Delete a stored token. Returns true when a token was removed, false when there was nothing to delete or the keyring is unavailable. */
export function deleteToken(provider: string): boolean {
	return keyring.delete(provider);
}

/** List the provider slugs that have a stored token under the holocron service scope. */
export function listStoredProviders(): string[] {
	return keyring.list();
}
