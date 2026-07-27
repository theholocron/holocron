import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory keyring simulator — same shape as keyring.test.ts.
const store = new Map<string, string>();
// Set to true in a test to make setPassword throw (simulates keyring unavailable).
let keyringFails = false;

vi.mock("@napi-rs/keyring", () => {
	class Entry {
		private readonly key: string;
		constructor(service: string, username: string) {
			this.key = `${service}::${username}`;
		}
		setPassword(pw: string): void {
			if (keyringFails) throw new Error("keyring unavailable");
			store.set(this.key, pw);
		}
		getPassword(): string | null {
			return store.get(this.key) ?? null;
		}
		deletePassword(): boolean {
			return store.delete(this.key);
		}
	}
	function findCredentials(service: string): Array<{ account: string; password: string }> {
		const prefix = `${service}::`;
		const out: Array<{ account: string; password: string }> = [];
		for (const [k, v] of store) {
			if (k.startsWith(prefix)) out.push({ account: k.slice(prefix.length), password: v });
		}
		return out;
	}
	return { Entry, findCredentials };
});

const { runAuthCheck, runAuthList, runAuthSet, runAuthUnset, resolveAuthSetToken } =
	await import("../commands/auth.js");

function reset() {
	store.clear();
}

function collect(): { print: (l: string) => void; lines: string[] } {
	const lines: string[] = [];
	return { lines, print: (l: string) => lines.push(l) };
}

describe("resolveAuthSetToken", () => {
	it("prefers positional over env vars", () => {
		expect(
			resolveAuthSetToken({
				provider: "doppler",
				positional: "pos",
				env: { HOLOCRON_DOPPLER_TOKEN: "hlc", DOPPLER_TOKEN: "vendor" },
			})
		).toBe("pos");
	});
	it("prefers HOLOCRON_<X>_TOKEN over vendor-native env", () => {
		expect(
			resolveAuthSetToken({
				provider: "doppler",
				env: { HOLOCRON_DOPPLER_TOKEN: "hlc", DOPPLER_TOKEN: "vendor" },
			})
		).toBe("hlc");
	});
	it("falls back to vendor-native env", () => {
		expect(resolveAuthSetToken({ provider: "doppler", env: { DOPPLER_TOKEN: "vendor" } })).toBe("vendor");
	});
	it("returns null when nothing is set", () => {
		expect(resolveAuthSetToken({ provider: "doppler", env: {} })).toBeNull();
	});

	it("uses process.env when no env is provided", () => {
		const original = process.env.HOLOCRON_DOPPLER_TOKEN;
		process.env.HOLOCRON_DOPPLER_TOKEN = "from-process-env";
		try {
			expect(resolveAuthSetToken({ provider: "doppler" })).toBe("from-process-env");
		} finally {
			if (original === undefined) delete process.env.HOLOCRON_DOPPLER_TOKEN;
			else process.env.HOLOCRON_DOPPLER_TOKEN = original;
		}
	});
});

describe("runAuthSet", () => {
	beforeEach(reset);

	it("stores + reports subject when verifyToken returns ok", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "doppler",
			positional: "dp.pt.abc",
			env: {},
			importer: async () => ({
				verifyToken: async () => ({ ok: true as const, subject: "workplace: acme" }),
			}),
			print,
		});
		expect(result.status).toBe("ok");
		expect(lines.join("\n")).toMatch(/stored doppler token \(workplace: acme\)/);
	});

	it("fails + does NOT store when verifyToken rejects", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "doppler",
			positional: "bad",
			env: {},
			importer: async () => ({
				verifyToken: async () => ({ ok: false as const, message: "401 unauthorized" }),
				AUTH_HINT: "run: doppler configure get token --plain",
			}),
			print,
		});
		expect(result.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/token rejected/);
		expect(lines.join("\n")).toMatch(/doppler configure get token --plain/);
	});

	it("fails without hint when verifyToken rejects and the module exports no AUTH_HINT", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "doppler",
			positional: "bad",
			env: {},
			importer: async () => ({
				verifyToken: async () => ({ ok: false as const, message: "401 unauthorized" }),
			}),
			print,
		});
		expect(result.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/token rejected/);
		expect(lines.join("\n")).not.toMatch(/hint:/);
	});

	it("prints hint + fails when no token supplied", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "doppler",
			env: {},
			importer: async () => ({ AUTH_HINT: "run: doppler configure get token --plain" }),
			print,
		});
		expect(result.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/no token supplied/);
		expect(lines.join("\n")).toMatch(/doppler configure get token --plain/);
	});

	it("stores without verification when the plugin exports no verifyToken", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "custom",
			positional: "abc",
			env: {},
			importer: async () => ({}),
			print,
		});
		expect(result.status).toBe("ok");
		expect(lines.join("\n")).toMatch(/no verifyToken/);
	});

	it("stores even when the plugin package can't be loaded", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "custom",
			positional: "abc",
			env: {},
			importer: async () => {
				throw new Error("MODULE_NOT_FOUND");
			},
			print,
		});
		expect(result.status).toBe("ok");
		expect(lines.join("\n")).toMatch(/failed to load/);
	});

	it("uses String(err) when importer throws a non-Error value", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "custom",
			positional: "abc",
			env: {},
			importer: async () => {
				throw "string error";
			},
			print,
		});
		expect(result.status).toBe("ok");
		expect(lines.join("\n")).toMatch(/string error/);
	});

	it("prints no hint when the plugin fails to load and no token supplied", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "doppler",
			env: {},
			importer: async () => {
				throw new Error("MODULE_NOT_FOUND");
			},
			print,
		});
		expect(result.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/no token supplied/);
		expect(lines.join("\n")).not.toMatch(/hint:/);
	});

	it("reads token from HOLOCRON_<X>_TOKEN when no positional supplied", async () => {
		const result = await runAuthSet({
			provider: "doppler",
			env: { HOLOCRON_DOPPLER_TOKEN: "env.abc" },
			importer: async () => ({ verifyToken: async () => ({ ok: true as const, subject: "test" }) }),
			print: () => {},
		});
		expect(result.status).toBe("ok");
	});

	it("fails when the keyring is unavailable", async () => {
		keyringFails = true;
		const { print, lines } = collect();
		try {
			const result = await runAuthSet({
				provider: "doppler",
				positional: "dp.pt.abc",
				env: {},
				importer: async () => ({ verifyToken: async () => ({ ok: true as const, subject: "test" }) }),
				print,
			});
			expect(result.status).toBe("fail");
			expect(result.message).toBe("keyring unavailable");
			expect(lines.join("\n")).toMatch(/keyring unavailable/);
		} finally {
			keyringFails = false;
		}
	});
	it("uses console.log when no print function is provided", async () => {
		const result = await runAuthSet({
			provider: "doppler",
			positional: "dp.pt.abc",
			env: {},
			importer: async () => ({ verifyToken: async () => ({ ok: true as const, subject: "test" }) }),
		});
		expect(result.status).toBe("ok");
	});

	it("stores a feature sub-key without plugin verification", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "github.read",
			positional: "ghp_xxx",
			env: {},
			print,
		});
		expect(result.status).toBe("ok");
		expect(lines.join("\n")).toMatch(/stored github\.read token/);
	});

	it("fails for a feature sub-key with no token and omits env-var hint", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "github.read",
			env: {},
			print,
		});
		expect(result.status).toBe("fail");
		expect(lines.join("\n")).not.toMatch(/HOLOCRON_GITHUB/);
	});
});

describe("runAuthUnset", () => {
	beforeEach(reset);

	it("removes a stored token", () => {
		store.set("com.theholocron.cli::doppler", "abc");
		const { print, lines } = collect();
		const result = runAuthUnset({ provider: "doppler", print });
		expect(result.status).toBe("ok");
		expect(lines.join("\n")).toMatch(/removed doppler/);
	});

	it("is a no-op skip when nothing was stored", () => {
		const { print, lines } = collect();
		const result = runAuthUnset({ provider: "doppler", print });
		expect(result.status).toBe("skip");
		expect(lines.join("\n")).toMatch(/no stored token/);
	});

	it("uses console.log when no print function is provided", () => {
		store.set("com.theholocron.cli::doppler", "abc");
		const result = runAuthUnset({ provider: "doppler" });
		expect(result.status).toBe("ok");
	});
});

describe("runAuthCheck", () => {
	beforeEach(reset);

	it("uses console.log when no print function is provided", async () => {
		const result = await runAuthCheck({ provider: "doppler" });
		expect(result.status).toBe("skip");
	});

	it("reports skip when no token is stored", async () => {
		const { print, lines } = collect();
		const result = await runAuthCheck({
			provider: "doppler",
			importer: async () => ({ verifyToken: async () => ({ ok: true as const, subject: "x" }) }),
			print,
		});
		expect(result.status).toBe("skip");
		expect(lines.join("\n")).toMatch(/no stored token/);
	});

	it("reports ok + subject when the stored token verifies", async () => {
		store.set("com.theholocron.cli::doppler", "dp.pt.abc");
		const { print, lines } = collect();
		const result = await runAuthCheck({
			provider: "doppler",
			importer: async () => ({ verifyToken: async () => ({ ok: true as const, subject: "workplace: acme" }) }),
			print,
		});
		expect(result.status).toBe("ok");
		expect(lines.join("\n")).toMatch(/doppler: ok — workplace: acme/);
	});

	it("reports fail + hint when the stored token is rejected", async () => {
		store.set("com.theholocron.cli::doppler", "stale");
		const { print, lines } = collect();
		const result = await runAuthCheck({
			provider: "doppler",
			importer: async () => ({
				verifyToken: async () => ({ ok: false as const, message: "401 unauthorized" }),
				AUTH_HINT: "run: doppler configure get token --plain",
			}),
			print,
		});
		expect(result.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/rejected/);
		expect(lines.join("\n")).toMatch(/doppler configure get token/);
	});

	it("reports fail without hint when the rejected module exports no AUTH_HINT", async () => {
		store.set("com.theholocron.cli::doppler", "stale");
		const { print, lines } = collect();
		const result = await runAuthCheck({
			provider: "doppler",
			importer: async () => ({
				verifyToken: async () => ({ ok: false as const, message: "401 unauthorized" }),
			}),
			print,
		});
		expect(result.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/rejected/);
		expect(lines.join("\n")).not.toMatch(/hint:/);
	});

	it("reports ok-unverified when the plugin has no verifyToken", async () => {
		store.set("com.theholocron.cli::custom", "abc");
		const { print, lines } = collect();
		const result = await runAuthCheck({
			provider: "custom",
			importer: async () => ({}),
			print,
		});
		expect(result.status).toBe("ok");
		expect(result.message).toBe("stored, unverified");
		expect(lines.join("\n")).toMatch(/can't confirm validity/);
	});

	it("reports fail when verifyToken throws", async () => {
		store.set("com.theholocron.cli::doppler", "dp.pt.abc");
		const { print, lines } = collect();
		const result = await runAuthCheck({
			provider: "doppler",
			importer: async () => ({
				verifyToken: async () => {
					throw new Error("network error");
				},
			}),
			print,
		});
		expect(result.status).toBe("fail");
		expect(result.message).toContain("network error");
		expect(lines.join("\n")).toMatch(/cannot verify/);
	});

	it("reports fail with string coercion when a non-Error is thrown", async () => {
		store.set("com.theholocron.cli::doppler", "dp.pt.abc");
		const { print, lines } = collect();
		const result = await runAuthCheck({
			provider: "doppler",
			importer: async () => ({
				verifyToken: async () => {
					throw "bad string error";
				},
			}),
			print,
		});
		expect(result.status).toBe("fail");
		expect(result.message).toBe("bad string error");
		expect(lines.join("\n")).toMatch(/cannot verify/);
	});

	it("reports ok for a feature sub-key when a token is stored", async () => {
		store.set("com.theholocron.cli::github.read", "ghp_abc");
		const { print, lines } = collect();
		const result = await runAuthCheck({ provider: "github.read", print });
		expect(result.status).toBe("ok");
		expect(result.message).toBe("stored");
		expect(lines.join("\n")).toMatch(/feature key — no plugin verification/);
	});

	it("skips the spinner when showSpinner is false", async () => {
		store.set("com.theholocron.cli::doppler", "dp.pt.abc");
		const { print, lines } = collect();
		const result = await runAuthCheck({
			provider: "doppler",
			importer: async () => ({ verifyToken: async () => ({ ok: true as const, subject: "workplace: acme" }) }),
			print,
			showSpinner: false,
		});
		expect(result.status).toBe("ok");
		expect(lines.join("\n")).toMatch(/doppler: ok — workplace: acme/);
	});

	it("reports fail without spinner when showSpinner is false and token is rejected", async () => {
		store.set("com.theholocron.cli::doppler", "stale");
		const { print, lines } = collect();
		const result = await runAuthCheck({
			provider: "doppler",
			importer: async () => ({ verifyToken: async () => ({ ok: false as const, message: "expired" }) }),
			print,
			showSpinner: false,
		});
		expect(result.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/rejected — expired/);
	});
});

describe("runAuthList", () => {
	beforeEach(reset);

	it("prints a friendly message when nothing is stored", async () => {
		const { print, lines } = collect();
		const result = await runAuthList({ print });
		expect(result.status).toBe("ok");
		expect(lines.join("\n")).toMatch(/no stored tokens/);
	});

	it("lists every stored provider with validity status", async () => {
		store.set("com.theholocron.cli::doppler", "dp.pt.abc");
		store.set("com.theholocron.cli::infisical", "inf.stale");
		const { print, lines } = collect();
		await runAuthList({
			print,
			importer: async (pkg: string) => {
				if (pkg.includes("doppler"))
					return { verifyToken: async () => ({ ok: true as const, subject: "workplace: acme" }) };
				return { verifyToken: async () => ({ ok: false as const, message: "expired" }) };
			},
		});
		const joined = lines.join("\n");
		expect(joined).toMatch(/✓ doppler — workplace: acme/);
		expect(joined).toMatch(/✗ infisical — expired/);
	});

	it("renders a skip bullet for a provider whose token cannot be retrieved", async () => {
		// Empty-string password: findCredentials includes it (listed) but
		// !("") is true so runAuthCheck returns skip (token treated as absent).
		store.set("com.theholocron.cli::ghost", "");
		const { print, lines } = collect();
		await runAuthList({
			print,
			importer: async () => ({ verifyToken: async () => ({ ok: true as const, subject: "x" }) }),
		});
		expect(lines.join("\n")).toMatch(/· ghost/);
	});

	it("uses console.log when no print function is provided", async () => {
		store.set("com.theholocron.cli::doppler", "dp.pt.abc");
		const result = await runAuthList({
			importer: async () => ({ verifyToken: async () => ({ ok: true as const, subject: "test" }) }),
		});
		expect(result.status).toBe("ok");
	});

	it("shows no hint when no token and plugin has no AUTH_HINT", async () => {
		const { print, lines } = collect();
		const result = await runAuthSet({
			provider: "custom",
			env: {},
			importer: async () => ({}),
			print,
		});
		expect(result.status).toBe("fail");
		expect(lines.join("\n")).not.toMatch(/hint:/);
	});

	it("renders a provider line without detail when the subject is empty", async () => {
		// An empty subject is falsy, so check.message ? ` — ${msg}` : "" takes the "" branch.
		store.set("com.theholocron.cli::doppler", "dp.pt.abc");
		const { print, lines } = collect();
		await runAuthList({
			print,
			importer: async () => ({ verifyToken: async () => ({ ok: true as const, subject: "" as const }) }),
		});
		expect(lines.join("\n")).toMatch(/✓ doppler\s*$/m);
	});
});
