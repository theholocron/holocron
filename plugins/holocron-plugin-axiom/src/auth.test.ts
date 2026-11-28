import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthError, resolveToken, tokens } from "./auth.js";

describe("tokens: verify", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	/** Stubs the global `fetch` to answer 403 for the user and `status` for the dataset, and returns the requested URLs. */
	function stubAxiom(status: number): string[] {
		const urls: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request) => {
			urls.push(String(input));
			return new Response("{}", { status: urls.length === 1 ? 403 : status });
		});
		return urls;
	}

	it("asks about the dataset HOLOCRON_AXIOM_DATASET names", async () => {
		vi.stubEnv("HOLOCRON_AXIOM_DATASET", "holocron");
		const urls = stubAxiom(200);
		const result = await tokens[0]!.verify!("xaat-scoped");
		expect(result).toEqual({ ok: true, subject: "API token" });
		expect(urls[1]).toContain("/v2/datasets/holocron");
	});

	it("falls back to AXIOM_DATASET, then to the probe name when neither is set", async () => {
		vi.stubEnv("HOLOCRON_AXIOM_DATASET", "");
		vi.stubEnv("AXIOM_DATASET", "vendor-set");
		const first = stubAxiom(200);
		await tokens[0]!.verify!("t");
		expect(first[1]).toContain("/v2/datasets/vendor-set");

		vi.stubEnv("AXIOM_DATASET", "");
		const second = stubAxiom(404);
		expect(await tokens[0]!.verify!("t")).toEqual({ ok: true, subject: "API token" });
		expect(second[1]).toContain("/v2/datasets/holocron-token-check");
	});
});

describe("resolveToken", () => {
	const noKeyring = () => null;

	it("prefers --token over env vars + keyring", () => {
		expect(
			resolveToken({
				cliToken: "flag",
				env: { HOLOCRON_AXIOM_TOKEN: "hlc", AXIOM_TOKEN: "vendor" },
				keyring: () => "kr",
			})
		).toBe("flag");
	});

	it("prefers HOLOCRON_AXIOM_TOKEN over AXIOM_TOKEN", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_AXIOM_TOKEN: "hlc", AXIOM_TOKEN: "vendor" },
				keyring: noKeyring,
			})
		).toBe("hlc");
	});

	it("falls back to AXIOM_TOKEN when HOLOCRON_AXIOM_TOKEN is unset", () => {
		expect(resolveToken({ env: { AXIOM_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
	});

	it("falls back to keyring when env vars are unset", () => {
		expect(resolveToken({ env: {}, keyring: (p) => (p === "axiom" ? "kr" : null) })).toBe("kr");
	});

	it("throws AuthError naming both env vars when no token is found anywhere", () => {
		const err = (() => {
			try {
				resolveToken({ env: {}, keyring: noKeyring });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as Error).message).toMatch(/HOLOCRON_AXIOM_TOKEN/);
		expect((err as Error).message).toMatch(/AXIOM_TOKEN/);
		expect((err as Error).message).toMatch(/holocron new token axiom/);
	});
});
