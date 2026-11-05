import { beforeEach, describe, expect, it, vi } from "vitest";

import { createKeyring } from "./keyring.js";
import type { Keyring, KeyringBinding } from "./keyring.type.js";

// In-memory keyring simulator standing in for the OS. `resetKeyring()` clears it between cases.
const store = new Map<string, string>();
let entryThrows = false;
let findThrows = false;
// How many times the simulated OS keyring was actually asked for a password.
let reads = 0;

class Entry {
	private readonly key: string;
	constructor(service: string, username: string) {
		if (entryThrows) throw new Error("platform unsupported");
		this.key = `${service}::${username}`;
	}
	setPassword(pw: string): void {
		if (entryThrows) throw new Error("platform unsupported");
		store.set(this.key, pw);
	}
	getPassword(): string | null {
		reads++;
		if (entryThrows) throw new Error("platform unsupported");
		return store.get(this.key) ?? null;
	}
	deletePassword(): boolean {
		if (entryThrows) throw new Error("platform unsupported");
		return store.delete(this.key);
	}
}

const binding: KeyringBinding = {
	Entry,
	findCredentials(service) {
		if (findThrows) throw new Error("platform unsupported");
		const prefix = `${service}::`;
		return [...store].filter(([k]) => k.startsWith(prefix)).map(([k]) => ({ account: k.slice(prefix.length) }));
	},
};

let keyring: Keyring;

function resetKeyring() {
	store.clear();
	entryThrows = false;
	findThrows = false;
	reads = 0;
	keyring = createKeyring({ service: "com.example.tool", binding });
}

describe("keyring", () => {
	beforeEach(resetKeyring);

	it("set then get round-trips the value", () => {
		expect(keyring.set("doppler", "dp.pt.abc")).toBe(true);
		expect(keyring.get("doppler")).toBe("dp.pt.abc");
	});

	it("get returns null when no entry exists", () => {
		expect(keyring.get("doppler")).toBeNull();
	});

	it("set overwrites an existing entry", () => {
		keyring.set("doppler", "first");
		keyring.set("doppler", "second");
		expect(keyring.get("doppler")).toBe("second");
	});

	it("delete removes the entry and returns true", () => {
		keyring.set("doppler", "abc");
		expect(keyring.delete("doppler")).toBe(true);
		expect(keyring.get("doppler")).toBeNull();
	});

	it("delete returns false when nothing was stored", () => {
		expect(keyring.delete("doppler")).toBe(false);
	});

	it("scopes entries per provider", () => {
		keyring.set("doppler", "dp.pt.abc");
		keyring.set("infisical", "inf.abc");
		expect(keyring.get("doppler")).toBe("dp.pt.abc");
		expect(keyring.get("infisical")).toBe("inf.abc");
	});

	it("list returns every account under the service", () => {
		keyring.set("doppler", "a");
		keyring.set("infisical", "b");
		expect(keyring.list().sort()).toEqual(["doppler", "infisical"]);
	});

	it("list returns empty when nothing is stored", () => {
		expect(keyring.list()).toEqual([]);
	});

	describe("the in-process cache", () => {
		it("asks the keyring once for a token read many times", () => {
			store.set("com.example.tool::doppler", "dp.pt.abc");
			expect(keyring.get("doppler")).toBe("dp.pt.abc");
			expect(keyring.get("doppler")).toBe("dp.pt.abc");
			expect(keyring.get("doppler")).toBe("dp.pt.abc");
			expect(reads).toBe(1);
		});

		it("remembers a miss too, so a token that is not stored is asked about once", () => {
			expect(keyring.get("doppler")).toBeNull();
			expect(keyring.get("doppler")).toBeNull();
			expect(reads).toBe(1);
		});

		it("remembers that the keyring is unavailable", () => {
			entryThrows = true;
			expect(keyring.get("doppler")).toBeNull();
			entryThrows = false;
			store.set("com.example.tool::doppler", "now-available");
			expect(keyring.get("doppler")).toBeNull();
			expect(reads).toBe(0);
		});

		it("keeps a separate answer for each provider", () => {
			store.set("com.example.tool::doppler", "a");
			keyring.get("doppler");
			keyring.get("infisical");
			expect(reads).toBe(2);
		});

		it("serves a token it just stored without asking the keyring", () => {
			keyring.set("doppler", "stored");
			expect(keyring.get("doppler")).toBe("stored");
			expect(reads).toBe(0);
		});

		it("forgets a token it just deleted", () => {
			keyring.set("doppler", "abc");
			keyring.delete("doppler");
			expect(keyring.get("doppler")).toBeNull();
			expect(reads).toBe(0);
		});

		it("does not trust the cache after a store that failed", () => {
			keyring.get("doppler");
			entryThrows = true;
			expect(keyring.set("doppler", "abc")).toBe(false);
			entryThrows = false;
			store.set("com.example.tool::doppler", "from-outside");
			expect(keyring.get("doppler")).toBe("from-outside");
		});

		it("does not trust the cache after a delete that failed", () => {
			keyring.set("doppler", "abc");
			entryThrows = true;
			expect(keyring.delete("doppler")).toBe(false);
			entryThrows = false;
			expect(keyring.get("doppler")).toBe("abc");
		});

		it("reads the keyring again after clearCache", () => {
			store.set("com.example.tool::doppler", "one");
			expect(keyring.get("doppler")).toBe("one");
			store.set("com.example.tool::doppler", "two");
			expect(keyring.get("doppler")).toBe("one");
			keyring.clearCache();
			expect(keyring.get("doppler")).toBe("two");
		});

		it("does not cache the list of stored providers", () => {
			keyring.set("doppler", "a");
			expect(keyring.list()).toEqual(["doppler"]);
			keyring.set("infisical", "b");
			expect(keyring.list().sort()).toEqual(["doppler", "infisical"]);
		});
	});

	describe("platform-unsupported degrade path", () => {
		it("set returns false when the keyring throws", () => {
			entryThrows = true;
			expect(keyring.set("doppler", "abc")).toBe(false);
		});

		it("get returns null when the keyring throws", () => {
			entryThrows = true;
			expect(keyring.get("doppler")).toBeNull();
		});

		it("delete returns false when the keyring throws", () => {
			entryThrows = true;
			expect(keyring.delete("doppler")).toBe(false);
		});

		it("list returns empty when findCredentials throws", () => {
			findThrows = true;
			expect(keyring.list()).toEqual([]);
		});

		it("isAvailable tells a keyring that cannot be reached from an empty one", () => {
			expect(keyring.isAvailable()).toBe(true);
			findThrows = true;
			expect(keyring.isAvailable()).toBe(false);
		});
	});
});

describe("keyring without a binding", () => {
	it("answers nothing, and says it is unavailable, when the binding is null", () => {
		const none = createKeyring({ service: "com.example.tool", binding: null });
		expect(none.get("a")).toBeNull();
		expect(none.set("a", "x")).toBe(false);
		expect(none.delete("a")).toBe(false);
		expect(none.list()).toEqual([]);
		expect(none.isAvailable()).toBe(false);
	});

	it("scopes its entries to the service it is given", () => {
		resetKeyring();
		const other = createKeyring({ service: "com.example.other", binding });
		keyring.set("doppler", "mine");
		other.set("doppler", "other-secret");
		expect(keyring.get("doppler")).toBe("mine");
		expect(other.get("doppler")).toBe("other-secret");
		expect(keyring.list()).toEqual(["doppler"]);
	});
});

describe("the default binding", () => {
	it("loads @napi-rs/keyring on first use, once", async () => {
		vi.resetModules();
		const loaded = vi.fn(() => binding);
		vi.doMock("node:module", () => ({ createRequire: () => loaded }));
		const { createKeyring: fresh } = await import("./keyring.js");
		store.clear();
		const lazy = fresh({ service: "com.example.tool" });
		expect(loaded).not.toHaveBeenCalled();
		expect(lazy.set("a", "x")).toBe(true);
		expect(lazy.get("a")).toBe("x");
		expect(lazy.list()).toEqual(["a"]);
		expect(loaded).toHaveBeenCalledTimes(1);
		expect(loaded).toHaveBeenCalledWith("@napi-rs/keyring");
		vi.doUnmock("node:module");
	});

	it("is unavailable, and never throws, when @napi-rs/keyring cannot be loaded", async () => {
		vi.resetModules();
		vi.doMock("node:module", () => ({
			createRequire: () => () => {
				throw new Error("Cannot find module '@napi-rs/keyring'");
			},
		}));
		const { createKeyring: fresh } = await import("./keyring.js");
		const lazy = fresh({ service: "com.example.tool" });
		expect(lazy.isAvailable()).toBe(false);
		expect(lazy.get("a")).toBeNull();
		expect(lazy.set("a", "x")).toBe(false);
		expect(lazy.list()).toEqual([]);
		vi.doUnmock("node:module");
	});
});
