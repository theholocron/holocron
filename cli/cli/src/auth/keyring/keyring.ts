/**
 * Keyring-backed bootstrap credential store.
 *
 * Every holocron plugin's bootstrap token (the one it needs before it
 * can talk to its vendor's API) can be stored in the OS keyring under
 * a single reverse-DNS service scope. Managed via `holocron auth`
 * subcommands; consulted at position 4 in every plugin's auth
 * precedence chain (after --token / HOLOCRON_<X>_TOKEN / <native>_TOKEN).
 *
 * See `docs/wiki/specifications/tech-auth-bootstrap.spec.md` for the design rationale.
 *
 * Failure model: keyring access is best-effort. Platforms without a
 * supported credential store (some Linux CI images, sandboxed
 * environments) will throw from the underlying library. Every export
 * here catches and returns a null/empty result rather than propagating
 * — the plugin's precedence chain then falls through to
 * env-var-only paths, which is exactly how CI is meant to work.
 */

import { Entry, findCredentials } from "@napi-rs/keyring";

const SERVICE = "com.theholocron.cli";

/**
 * What `getToken` has already read, by provider, for the life of this process. A miss (`null`) is remembered too, so
 * a token that is not stored, or a keyring that is unavailable, is asked about once, not on every lookup. The OS
 * keyring can prompt on each read, and several resolvers ask for the same entry in one command.
 *
 * It lives in memory only. A cache that outlived the process would mean writing tokens somewhere else, which is
 * what the keyring is there to avoid.
 */
const cache = new Map<string, string | null>();

/**
 * Forget every token `getToken` has remembered, so the next read asks the keyring again. `setToken` and
 * `deleteToken` already keep the cache right for what they change; this is for a test, or after the keyring was
 * changed from outside the process.
 */
export function clearTokenCache(): void {
	cache.clear();
}

/**
 * Store or overwrite a bootstrap token for a provider. Returns true on
 * success, false when the underlying keyring is unsupported or errored.
 */
export function setToken(provider: string, token: string): boolean {
	try {
		new Entry(SERVICE, provider).setPassword(token);
		cache.set(provider, token);
		return true;
	} catch {
		cache.delete(provider);
		return false;
	}
}

/**
 * Read the bootstrap token for a provider. Returns `null` for both
 * "not stored" and "keyring unavailable" — callers can treat them the
 * same way (fall through to env-var precedence). The answer is
 * remembered for the rest of the process, so the keyring is asked once
 * per provider.
 */
export function getToken(provider: string): string | null {
	if (cache.has(provider)) return cache.get(provider)!;
	let token: string | null;
	try {
		token = new Entry(SERVICE, provider).getPassword();
	} catch {
		token = null;
	}
	cache.set(provider, token);
	return token;
}

/**
 * Delete a stored token. Returns true when a token was removed, false
 * when there was nothing to delete or the keyring is unavailable.
 * Distinguishing the two cases isn't worth the surface area — the
 * command output makes the situation clear either way.
 */
export function deleteToken(provider: string): boolean {
	try {
		const removed = new Entry(SERVICE, provider).deletePassword();
		cache.set(provider, null);
		return removed;
	} catch {
		cache.delete(provider);
		return false;
	}
}

/**
 * List provider slugs with a stored token in this service scope.
 * Uses the library's `findCredentials(service)` — supported on all
 * platforms the underlying credential store supports.
 */
export function listStoredProviders(): string[] {
	try {
		return findCredentials(SERVICE).map((c) => c.account);
	} catch {
		return [];
	}
}
