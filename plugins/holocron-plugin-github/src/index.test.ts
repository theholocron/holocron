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
	GitHubProjects,
	GitHubSecrets,
	GitHubSource,
	tokens,
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

describe("projects capability", () => {
	it("builds the GitHub provider and names the org token when none is set", () => {
		const plugin = createPlugin({ repo: "theholocron/holocron", cliToken: "pat-test" });
		expect(plugin.capabilities.projects()).toBeInstanceOf(GitHubProjects);
		const bare = createPlugin({ repo: "theholocron/holocron", env: {}, keyring: () => null });
		expect(() => bare.capabilities.projects()).toThrow(/HOLOCRON_ORG_TOKEN/);
	});
});

describe("the plugin's tokens export", () => {
	it("marks only the release token optional, since only CI's release workflow reads it", () => {
		const optional = tokens.filter((t) => t.optional === true).map((t) => t.envName);
		expect(optional).toEqual(["HOLOCRON_RELEASE_TOKEN"]);
		expect(tokens.find((t) => t.envName === "HOLOCRON_RELEASE_TOKEN")).toMatchObject({
			keyringKey: "github.release",
		});
	});

	it("still lists every other token as needed", () => {
		expect(tokens.map((t) => t.envName)).toEqual([
			"HOLOCRON_READ_TOKEN",
			"HOLOCRON_ISSUES_TOKEN",
			"HOLOCRON_SYNC_TOKEN",
			"HOLOCRON_RELEASE_TOKEN",
			"HOLOCRON_ADMIN_TOKEN",
			"HOLOCRON_SECRETS_TOKEN",
			"HOLOCRON_DEPLOY_TOKEN",
			"HOLOCRON_USER_SYNC_TOKEN",
			"HOLOCRON_ORG_TOKEN",
		]);
	});
});

describe("the issue-types probe", () => {
	const run = async (options: Record<string, unknown>) => {
		const rows: string[] = [];
		const plugin = createPlugin({ repo: "acme/widgets", ...options } as never);
		await plugin.probes["issue-types"].run({
			args: ["--issues", "1"],
			dryRun: true,
			say: (r) => void rows.push(`${r.status} ${r.label}`),
			secret: () => {},
			write: async () => undefined,
			cleanup: () => {},
		});
		return rows;
	};

	it("is a writer probe of the plugin", () => {
		const plugin = createPlugin({ repo: "acme/widgets" });
		expect(plugin.probes["issue-types"].writes).toBe(true);
	});

	it("reads with the issues and org tokens and the area map the loader hands it", async () => {
		const seen: string[] = [];
		const fetchFn: typeof fetch = async (input, init) => {
			const url = new URL(String(input));
			seen.push(`${init?.method ?? "GET"} ${url.pathname}`);
			const issue = {
				id: 1,
				number: 1,
				title: "fix(cli): x",
				state: "open",
				labels: [{ name: "bug" }],
				assignee: null,
			};
			const body: Record<string, unknown> = {
				"/repos/acme/widgets/issues/1": issue,
				"/repos/acme/widgets/labels": [{ name: "area:cli" }],
				"/graphql": {
					data: {
						nodes: [],
						organization: {
							issueTypes: { nodes: [{ name: "Bug" }, { name: "Feature" }, { name: "Task" }] },
						},
					},
				},
			};
			return new Response(JSON.stringify(body[url.pathname] ?? []), { status: 200 });
		};
		const rows = await run({
			cliToken: "t",
			fetch: fetchFn,
			areaLabels: { areas: { cli: ["cli/**"] }, scopes: { cli: "cli" } },
		});
		expect(seen).toContain("GET /repos/acme/widgets/issues/1");
		expect(rows).toContain("info area labels");
	});

	it("fails with the token's name when it is not configured", async () => {
		expect(await run({ env: {}, keyring: () => null })).toEqual(["fail issue-types"]);
	});
});
