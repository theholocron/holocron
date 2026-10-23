/**
 * End-to-end wiring: createPlugin() should produce instantiable
 * implementations of every capability it declares.
 */

import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import {
	AuthError,
	createPlugin,
	GitHubCi,
	GitHubEnvironments,
	GitHubIssues,
	GitHubSecrets,
	GitHubSource,
} from "./index.js";

const LABELS = { inProgress: "status:in-progress", inReview: "status:in-review" };

describe("createPlugin", () => {
	it("does not throw at construction even when no token is set", () => {
		expect(() => createPlugin({ repo: "theholocron/holocron", env: {}, keyring: () => null })).not.toThrow();
	});

	it("throws AuthError when a capability is accessed with no token", () => {
		const plugin = createPlugin({ repo: "theholocron/holocron", env: {}, keyring: () => null });
		expect(() => plugin.capabilities.source()).toThrow(AuthError);
	});

	it("each capability throws AuthError naming its own feature token", () => {
		const plugin = createPlugin({ repo: "theholocron/holocron", env: {}, keyring: () => null });
		const sourceErr = (() => {
			try {
				plugin.capabilities.source();
			} catch (e) {
				return e;
			}
		})();
		expect((sourceErr as Error).message).toMatch(/HOLOCRON_ADMIN_TOKEN/);

		const ciErr = (() => {
			try {
				plugin.capabilities.ci();
			} catch (e) {
				return e;
			}
		})();
		expect((ciErr as Error).message).toMatch(/HOLOCRON_READ_TOKEN/);

		const issuesErr = (() => {
			try {
				plugin.capabilities.issues();
			} catch (e) {
				return e;
			}
		})();
		expect((issuesErr as Error).message).toMatch(/HOLOCRON_ISSUES_TOKEN/);
	});

	describe("secrets capability picks its token by scope", () => {
		const EMPTY = { status: 200, body: { total_count: 0, secrets: [] } };

		async function authFor(env: Record<string, string>, scope: Parameters<GitHubSecrets["listSecrets"]>[0]) {
			const stub = stubFetch([EMPTY]);
			const plugin = createPlugin({ repo: "theholocron/holocron", env, keyring: () => null, fetch: stub.fetch });
			await plugin.capabilities.secrets().listSecrets(scope);
			return stub.calls[0]?.headers.authorization;
		}
		const ORG = { kind: "organization", name: "theholocron" } as const;
		const BOTH = { HOLOCRON_SECRETS_TOKEN: "org-pat", HOLOCRON_ADMIN_TOKEN: "admin-pat" };

		it("with both tokens: org scope uses github.secrets, repo and environment scopes use github.admin", async () => {
			expect(await authFor(BOTH, ORG)).toBe("Bearer org-pat");
			expect(await authFor(BOTH, { kind: "repo" })).toBe("Bearer admin-pat");
			expect(await authFor(BOTH, { kind: "environment", name: "production" })).toBe("Bearer admin-pat");
		});

		it("with only github.secrets: it serves every scope (it is better than nothing)", async () => {
			const env = { HOLOCRON_SECRETS_TOKEN: "org-pat" };
			expect(await authFor(env, ORG)).toBe("Bearer org-pat");
			expect(await authFor(env, { kind: "repo" })).toBe("Bearer org-pat");
		});

		it("with only github.admin: it serves every scope, as before this token existed", async () => {
			const env = { HOLOCRON_ADMIN_TOKEN: "admin-pat" };
			expect(await authFor(env, ORG)).toBe("Bearer admin-pat");
			expect(await authFor(env, { kind: "repo" })).toBe("Bearer admin-pat");
		});

		it("an explicit token serves every scope", async () => {
			const stub = stubFetch([EMPTY, EMPTY]);
			const plugin = createPlugin({
				repo: "theholocron/holocron",
				cliToken: "cli-pat",
				env: BOTH,
				keyring: () => null,
				fetch: stub.fetch,
			});
			const caps = plugin.capabilities.secrets();
			await caps.listSecrets(ORG);
			await caps.listSecrets({ kind: "repo" });
			expect(stub.calls.map((c) => c.headers.authorization)).toEqual(["Bearer cli-pat", "Bearer cli-pat"]);
		});

		it("with neither token it fails like the other admin-token capabilities", () => {
			const plugin = createPlugin({ repo: "theholocron/holocron", env: {}, keyring: () => null });
			expect(() => plugin.capabilities.secrets()).toThrow(AuthError);
			expect(() => plugin.capabilities.secrets()).toThrow(/HOLOCRON_ADMIN_TOKEN/);
		});

		it("does not swallow an error that is not a missing token", () => {
			const boom = () => {
				throw new TypeError("keyring exploded");
			};
			const plugin = createPlugin({ repo: "theholocron/holocron", env: {}, keyring: boom });
			expect(() => plugin.capabilities.secrets()).toThrow(TypeError);
		});
	});

	it("wires every capability with the right concrete implementation", () => {
		const plugin = createPlugin({
			repo: "theholocron/holocron",
			cliToken: "pat-test",
			labels: LABELS,
		});

		expect(plugin.name).toBe("@theholocron/holocron-plugin-github");
		expect(plugin.capabilities.source()).toBeInstanceOf(GitHubSource);
		expect(plugin.capabilities.secrets()).toBeInstanceOf(GitHubSecrets);
		expect(plugin.capabilities.environments()).toBeInstanceOf(GitHubEnvironments);
		expect(plugin.capabilities.ci()).toBeInstanceOf(GitHubCi);
		expect(plugin.capabilities.issues()).toBeInstanceOf(GitHubIssues);
	});

	it("capabilities with different tokens coexist — issues token set, admin absent", () => {
		const plugin = createPlugin({
			repo: "theholocron/holocron",
			env: { HOLOCRON_ISSUES_TOKEN: "iss-pat" },
			keyring: () => null,
		});
		expect(plugin.capabilities.issues()).toBeInstanceOf(GitHubIssues);
		expect(() => plugin.capabilities.source()).toThrow(AuthError);
	});

	it("issues capability constructs without `labels` (lazy-degrade)", () => {
		const plugin = createPlugin({
			repo: "theholocron/holocron",
			cliToken: "pat-test",
		});
		// No throw — labels are optional at construction. Methods that
		// need labels (`transition` to inProgress/inReview) throw at
		// call time; see the issues.test.ts suite for those paths.
		expect(plugin.capabilities.issues()).toBeInstanceOf(GitHubIssues);
	});

	it("passes baseUrl + fetch through to the REST client", async () => {
		let captured: { url: string; method: string } | null = null;
		const fakeFetch: typeof fetch = async (input, init) => {
			captured = {
				url: typeof input === "string" ? input : input.toString(),
				method: (init?.method ?? "GET").toUpperCase(),
			};
			return new Response('{"login":"x"}', { status: 200 });
		};

		const plugin = createPlugin({
			repo: "theholocron/holocron",
			cliToken: "pat-test",
			baseUrl: "https://test.invalid",
			fetch: fakeFetch,
		});
		await plugin.capabilities.source().whoami();
		expect(captured).toEqual({ url: "https://test.invalid/user", method: "GET" });
	});
});
