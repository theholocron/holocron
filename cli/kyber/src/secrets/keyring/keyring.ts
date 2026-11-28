import { createRequire } from "node:module";

import type { Keyring, KeyringBinding, KeyringOptions } from "./keyring.type.js";

function loadBinding(): KeyringBinding | null {
	try {
		return createRequire(import.meta.url)("@napi-rs/keyring") as KeyringBinding;
	} catch {
		return null;
	}
}

/**
 * A tool's secrets in the OS keyring, under one service name.
 *
 * Keyring access is best-effort. Platforms without a supported credential store (some Linux CI images, sandboxed
 * environments) throw from the underlying library, and `@napi-rs/keyring` is an optional peer that may not be installed
 * at all. Every method catches that and answers `null`, `false` or an empty list rather than propagating, so a caller's
 * chain (a flag, then the environment, then the keyring) falls through to the paths that do work, which is how CI is
 * meant to run.
 *
 * Reads are remembered in memory only, for the life of the process. A cache that outlived the process would mean writing
 * secrets somewhere else, which is what the keyring is there to avoid.
 */
export function createKeyring(options: KeyringOptions): Keyring {
	const { service } = options;
	const cache = new Map<string, string | null>();
	let binding: KeyringBinding | null | undefined = options.binding;
	const loaded = (): KeyringBinding | null => {
		if (binding === undefined) binding = loadBinding();
		return binding;
	};
	const entry = (account: string) => {
		const b = loaded();
		if (!b) throw new Error("no OS keyring available");
		return new b.Entry(service, account);
	};

	return {
		get(account) {
			if (cache.has(account)) return cache.get(account)!;
			let secret: string | null;
			try {
				secret = entry(account).getPassword();
			} catch {
				secret = null;
			}
			cache.set(account, secret);
			return secret;
		},
		set(account, secret) {
			try {
				entry(account).setPassword(secret);
				cache.set(account, secret);
				return true;
			} catch {
				cache.delete(account);
				return false;
			}
		},
		delete(account) {
			try {
				const removed = entry(account).deletePassword();
				cache.set(account, null);
				return removed;
			} catch {
				cache.delete(account);
				return false;
			}
		},
		list() {
			try {
				const b = loaded();
				return b ? b.findCredentials(service).map((c) => c.account) : [];
			} catch {
				return [];
			}
		},
		isAvailable() {
			try {
				const b = loaded();
				if (!b) return false;
				b.findCredentials(service);
				return true;
			} catch {
				return false;
			}
		},
		clearCache() {
			cache.clear();
		},
	};
}
