import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory keyring simulator, wired up as a mock of @napi-rs/keyring.
// A per-test call to `resetKeyring()` clears it between cases.
const store = new Map<string, string>();
let entryThrows = false;
let findThrows = false;
// How many times the (mocked) OS keyring was actually asked for a password.
let reads = 0;

vi.mock("@napi-rs/keyring", () => {
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
	function findCredentials(service: string): Array<{ account: string; password: string }> {
		if (findThrows) throw new Error("platform unsupported");
		const prefix = `${service}::`;
		const out: Array<{ account: string; password: string }> = [];
		for (const [k, v] of store) {
			if (k.startsWith(prefix)) out.push({ account: k.slice(prefix.length), password: v });
		}
		return out;
	}
	return { Entry, findCredentials };
});

// Import AFTER the mock so keyring.ts binds to the mocked module.
const { clearTokenCache, setToken, getToken, deleteToken, isKeyringAvailable, listStoredProviders } =
	await import("./keyring.js");

function resetKeyring() {
	store.clear();
	entryThrows = false;
	findThrows = false;
	reads = 0;
	clearTokenCache();
}

describe("keyring", () => {
	beforeEach(resetKeyring);

	it("setToken then getToken round-trips the value", () => {
		expect(setToken("doppler", "dp.pt.abc")).toBe(true);
		expect(getToken("doppler")).toBe("dp.pt.abc");
	});

	it("getToken returns null when no entry exists", () => {
		expect(getToken("doppler")).toBeNull();
	});

	it("setToken overwrites an existing entry", () => {
		setToken("doppler", "first");
		setToken("doppler", "second");
		expect(getToken("doppler")).toBe("second");
	});

	it("deleteToken removes the entry and returns true", () => {
		setToken("doppler", "abc");
		expect(deleteToken("doppler")).toBe(true);
		expect(getToken("doppler")).toBeNull();
	});

	it("deleteToken returns false when nothing was stored", () => {
		expect(deleteToken("doppler")).toBe(false);
	});

	it("scopes entries per provider", () => {
		setToken("doppler", "dp.pt.abc");
		setToken("infisical", "inf.abc");
		expect(getToken("doppler")).toBe("dp.pt.abc");
		expect(getToken("infisical")).toBe("inf.abc");
	});

	it("listStoredProviders returns every account under the holocron service", () => {
		setToken("doppler", "a");
		setToken("infisical", "b");
		expect(listStoredProviders().sort()).toEqual(["doppler", "infisical"]);
	});

	it("listStoredProviders returns empty when nothing is stored", () => {
		expect(listStoredProviders()).toEqual([]);
	});

	describe("the in-process cache", () => {
		it("asks the keyring once for a token read many times", () => {
			store.set("com.theholocron.cli::doppler", "dp.pt.abc");
			expect(getToken("doppler")).toBe("dp.pt.abc");
			expect(getToken("doppler")).toBe("dp.pt.abc");
			expect(getToken("doppler")).toBe("dp.pt.abc");
			expect(reads).toBe(1);
		});

		it("remembers a miss too, so a token that is not stored is asked about once", () => {
			expect(getToken("doppler")).toBeNull();
			expect(getToken("doppler")).toBeNull();
			expect(reads).toBe(1);
		});

		it("remembers that the keyring is unavailable", () => {
			entryThrows = true;
			expect(getToken("doppler")).toBeNull();
			entryThrows = false;
			store.set("com.theholocron.cli::doppler", "now-available");
			expect(getToken("doppler")).toBeNull();
			expect(reads).toBe(0);
		});

		it("keeps a separate answer for each provider", () => {
			store.set("com.theholocron.cli::doppler", "a");
			getToken("doppler");
			getToken("infisical");
			expect(reads).toBe(2);
		});

		it("serves a token it just stored without asking the keyring", () => {
			setToken("doppler", "stored");
			expect(getToken("doppler")).toBe("stored");
			expect(reads).toBe(0);
		});

		it("forgets a token it just deleted", () => {
			setToken("doppler", "abc");
			deleteToken("doppler");
			expect(getToken("doppler")).toBeNull();
			expect(reads).toBe(0);
		});

		it("does not trust the cache after a store that failed", () => {
			getToken("doppler");
			entryThrows = true;
			expect(setToken("doppler", "abc")).toBe(false);
			entryThrows = false;
			store.set("com.theholocron.cli::doppler", "from-outside");
			expect(getToken("doppler")).toBe("from-outside");
		});

		it("does not trust the cache after a delete that failed", () => {
			setToken("doppler", "abc");
			entryThrows = true;
			expect(deleteToken("doppler")).toBe(false);
			entryThrows = false;
			expect(getToken("doppler")).toBe("abc");
		});

		it("reads the keyring again after clearTokenCache", () => {
			store.set("com.theholocron.cli::doppler", "one");
			expect(getToken("doppler")).toBe("one");
			store.set("com.theholocron.cli::doppler", "two");
			expect(getToken("doppler")).toBe("one");
			clearTokenCache();
			expect(getToken("doppler")).toBe("two");
		});

		it("does not cache the list of stored providers", () => {
			setToken("doppler", "a");
			expect(listStoredProviders()).toEqual(["doppler"]);
			setToken("infisical", "b");
			expect(listStoredProviders().sort()).toEqual(["doppler", "infisical"]);
		});
	});

	describe("platform-unsupported degrade path", () => {
		it("setToken returns false when the keyring throws", () => {
			entryThrows = true;
			expect(setToken("doppler", "abc")).toBe(false);
		});

		it("getToken returns null when the keyring throws", () => {
			entryThrows = true;
			expect(getToken("doppler")).toBeNull();
		});

		it("deleteToken returns false when the keyring throws", () => {
			entryThrows = true;
			expect(deleteToken("doppler")).toBe(false);
		});

		it("listStoredProviders returns empty when findCredentials throws", () => {
			findThrows = true;
			expect(listStoredProviders()).toEqual([]);
		});

		it("isKeyringAvailable tells a keyring that cannot be reached from an empty one", () => {
			expect(isKeyringAvailable()).toBe(true);
			findThrows = true;
			expect(isKeyringAvailable()).toBe(false);
		});
	});
});
