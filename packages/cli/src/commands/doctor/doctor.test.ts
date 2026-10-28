import { beforeEach, describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import {
	type CapabilityKey,
	type PluginImporter,
	PluginLoader,
	ProviderApiError,
	WorkspaceContextError,
} from "../../plugin/index.js";
import { runDoctor } from "./doctor.js";

// A fake structured logger so tests can assert exactly what reaches
// telemetry — never what the real `createLogger()` would do, which depends
// on Axiom env vars this test run shouldn't need.
const fakeLogger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	child: () => fakeLogger,
	flush: async () => {},
};
vi.mock("../../observability/logger/index.js", () => ({ getLogger: () => fakeLogger }));

beforeEach(() => {
	fakeLogger.debug.mockClear();
	fakeLogger.info.mockClear();
	fakeLogger.warn.mockClear();
	fakeLogger.error.mockClear();
});

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return {
		resolved: resolveConfig(rawConfig),
		filepath: "/tmp/test/holocron.config.json",
	};
}

function makePlugin(name: string, caps: Record<string, unknown>) {
	return {
		createPlugin: (_opts: Record<string, unknown>) => ({
			name,
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

function makeLoaderWith(loaded: LoadedConfig, modules: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(
		loaded.resolved,
		{ repoRoot: "/tmp/test", repo: "theholocron/holocron" },
		importer as unknown as PluginImporter
	);
}

describe("runDoctor", () => {
	it("reports ok for source.whoami succeeding", async () => {
		const lines: string[] = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => ["ONE", "TWO"] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: { whoami: async () => ({ login: "iamnewton" }) },
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: (l) => lines.push(l),
		});

		const sourceRow = report.rows.find((r) => r.capability === "source");
		expect(sourceRow).toMatchObject({ status: "ok" });
		expect(sourceRow?.message).toContain("iamnewton");

		const vaultRow = report.rows.find((r) => r.capability === "vault");
		expect(vaultRow?.status).toBe("ok");
		expect(vaultRow?.message).toContain("keys: 2 visible");

		expect(report.summary).toEqual({ ok: 2, fail: 0, skip: 0 });
		expect(lines.join("\n")).toContain("config: /tmp/test/holocron.config.json");
	});

	it("reports ok for deployment, environments, dns, and workers smoke checks", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { deployment: "cloudflare", environments: "github", dns: "cloudflare", workers: "cloudflare" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				deployment: {
					listProjects: async () => [
						{ id: "1", name: "a" },
						{ id: "2", name: "b" },
					],
				},
				dns: { whoami: async () => ({ ok: true, zones: 3 }) },
				workers: { whoami: async () => ({ ok: true, scripts: 4 }) },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				environments: { listEnvironments: async () => [{ name: "prod" }] },
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(report.rows.find((r) => r.capability === "deployment")).toMatchObject({
			status: "ok",
			message: "projects: 2 visible",
		});
		expect(report.rows.find((r) => r.capability === "environments")).toMatchObject({
			status: "ok",
			message: "environments: 1 configured",
		});
		expect(report.rows.find((r) => r.capability === "dns")).toMatchObject({
			status: "ok",
			message: "zones: 3 visible",
		});
		expect(report.rows.find((r) => r.capability === "workers")).toMatchObject({
			status: "ok",
			message: "scripts: 4 visible",
		});
	});

	it("names a loaded capability that the config does not list as `?`", async () => {
		const loaded = loadedFrom({ name: "demo", providers: {} });
		const loader = {
			load: async () => {},
			loadFailures: () => [],
			loadedKeys: () => ["source"],
			get: () => ({ whoami: async () => ({ login: "someone" }) }),
		} as unknown as PluginLoader;

		const report = await runDoctor({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(report.rows.find((r) => r.capability === "source")).toMatchObject({ provider: "?", status: "ok" });
	});

	it("skips dns and workers when the provider has no whoami implemented", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { dns: "cloudflare", workers: "cloudflare" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				dns: { listRecords: async () => [] },
				workers: { upsertProxy: async () => {} },
			}),
		});

		const report = await runDoctor({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(report.rows.find((r) => r.capability === "dns")).toMatchObject({ status: "skip" });
		expect(report.rows.find((r) => r.capability === "workers")).toMatchObject({ status: "skip" });
	});

	it("reports fail for dns when whoami resolves with ok: false", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { dns: "cloudflare" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				dns: { whoami: async () => ({ ok: false, zones: 0 }) },
			}),
		});

		const report = await runDoctor({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(report.rows.find((r) => r.capability === "dns")).toMatchObject({
			status: "fail",
			message: "zones: 0 visible",
		});
	});

	it("reports fail for workers when whoami resolves with ok: false", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { workers: "cloudflare" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				workers: { whoami: async () => ({ ok: false, scripts: 0 }) },
			}),
		});

		const report = await runDoctor({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(report.rows.find((r) => r.capability === "workers")).toMatchObject({
			status: "fail",
			message: "scripts: 0 visible",
		});
	});

	it("reports a fail row for a provider that failed to load", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { source: "github", dns: "cloudflare" },
		});
		// cloudflare plugin is absent from the module map → load failure
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: { whoami: async () => ({ login: "iamnewton" }) },
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const dnsRow = report.rows.find((r) => r.capability === "dns");
		expect(dnsRow).toMatchObject({ status: "fail", provider: "cloudflare" });
		expect(dnsRow?.message).toMatch(/failed to import/);
		// the working provider is still reported
		expect(report.rows.find((r) => r.capability === "source")?.status).toBe("ok");
		expect(report.summary.fail).toBe(1);
	});

	it("throws a WorkspaceContextError when no plugin resolves (global install) — theholocron/holocron#576", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { source: "github", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {}); // nothing resolves

		const err = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		}).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(WorkspaceContextError);
		expect((err as WorkspaceContextError).message).toMatch(/pnpm exec holocron doctor/);
	});

	it("reports fail when a smoke check throws", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					whoami: async () => {
						throw new Error("401 Unauthorized");
					},
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const sourceRow = report.rows.find((r) => r.capability === "source");
		expect(sourceRow?.status).toBe("fail");
		expect(sourceRow?.message).toContain("401 Unauthorized");
		expect(report.summary).toEqual({ ok: 1, fail: 1, skip: 0 });
	});

	it("appends a ProviderApiError's response-body details to the failure message, not just '→ <status>'", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { deployment: "cloudflare" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				deployment: {
					listProjects: async () => {
						throw new ProviderApiError(
							"Cloudflare GET /accounts/xxx/pages/projects → 400",
							400,
							'{"success":false,"errors":[{"code":1000,"message":"Pages is not enabled for this account"}]}'
						);
					},
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "deployment");
		expect(row?.status).toBe("fail");
		expect(row?.message).toContain("→ 400");
		expect(row?.message).toContain("Pages is not enabled for this account");
	});

	it("falls back to the plain error message when a ProviderApiError has no details", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { deployment: "cloudflare" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				deployment: {
					listProjects: async () => {
						throw new ProviderApiError("Cloudflare GET /accounts/xxx/pages/projects → 400", 400, undefined);
					},
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "deployment");
		expect(row?.status).toBe("fail");
		expect(row?.message).toBe("Cloudflare GET /accounts/xxx/pages/projects → 400");
	});

	it("keeps the vendor response body out of the structured log, even though the terminal message carries it", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { deployment: "cloudflare" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				deployment: {
					listProjects: async () => {
						throw new ProviderApiError(
							"Cloudflare GET /accounts/xxx/pages/projects → 400",
							400,
							'{"success":false,"errors":[{"code":1000,"message":"Pages is not enabled for this account"}]}'
						);
					},
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "deployment");
		expect(row?.message).toContain("Pages is not enabled for this account");

		const logCall = fakeLogger.warn.mock.calls.find(
			([obj]) => (obj as { capability: string }).capability === "deployment"
		);
		expect((logCall?.[0] as { detail: string }).detail).toBe("Cloudflare GET /accounts/xxx/pages/projects → 400");
		expect((logCall?.[0] as { detail: string }).detail).not.toContain("Pages is not enabled");
	});

	it("sanitizes control characters out of a vendor detail before it reaches the terminal", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { deployment: "cloudflare" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				deployment: {
					listProjects: async () => {
						throw new ProviderApiError(
							"Cloudflare GET /accounts/xxx/pages/projects → 400",
							400,
							"line one\nline two\x1b[31mRED\x1b[0m"
						);
					},
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "deployment");
		expect(row?.message).not.toContain("\n");
		expect(row?.message).not.toContain("\x1b");
		expect(row?.message).toContain("line one line two");
		expect(row?.message).toContain("RED");
	});

	it("caps an oversized vendor detail to a bounded length before it reaches the terminal", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { deployment: "cloudflare" },
		});
		const hugeDetail = "x".repeat(500);
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				deployment: {
					listProjects: async () => {
						throw new ProviderApiError(
							"Cloudflare GET /accounts/xxx/pages/projects → 400",
							400,
							hugeDetail
						);
					},
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "deployment");
		expect(row?.message).toContain("…");
		expect(row?.message?.length).toBeLessThan(260);
	});

	it("also falls back to the plain error message when details is present but blank after trimming", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { deployment: "cloudflare" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				deployment: {
					listProjects: async () => {
						throw new ProviderApiError("Cloudflare GET /accounts/xxx/pages/projects → 400", 400, "   ");
					},
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "deployment");
		expect(row?.status).toBe("fail");
		expect(row?.message).toBe("Cloudflare GET /accounts/xxx/pages/projects → 400");
	});

	it("reports skip for many-cardinality capabilities (no smoke endpoint yet)", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: {
				vault: "1password",
				notifications: ["slack", "discord"],
			},
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-slack": makePlugin("slack", { notifications: {} }),
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: {} }),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const notifRows = report.rows.filter((r) => r.capability === "notifications");
		expect(notifRows).toHaveLength(2);
		expect(notifRows.every((r) => r.status === "skip")).toBe(true);
		expect(notifRows.map((r) => r.provider)).toEqual(["slack", "discord"]);
	});

	it("runs each notifications provider's whoami, and reports ok, fail and skip per provider", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { notifications: ["slack", "discord", "email"] },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-slack": makePlugin("slack", { notifications: { whoami: async () => null } }),
			"@theholocron/holocron-plugin-discord": makePlugin("discord", {
				notifications: { whoami: async () => ({ target: "Holocron (as Holonet)" }) },
			}),
			"@theholocron/holocron-plugin-email": makePlugin("email", {
				notifications: {
					whoami: async () => {
						throw new Error("no Discord bot token found");
					},
				},
			}),
		});
		const report = await runDoctor({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });
		const rows = report.rows.filter((r) => r.capability === "notifications");
		expect(rows.map((r) => [r.provider, r.status])).toEqual([
			["slack", "skip"],
			["discord", "ok"],
			["email", "fail"],
		]);
		expect(rows[1]?.message).toBe("server: Holocron (as Holonet)");
		expect(rows[2]?.message).toContain("no Discord bot token found");
	});

	it("keeps terminal control characters from a server name off the report", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"] } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", {
				notifications: { whoami: async () => ({ target: "Evil\u001b[2J\u009b31m\nFAKE ROW (as bot)" }) },
			}),
		});
		const lines: string[] = [];
		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: (l) => lines.push(l),
		});
		const row = report.rows.find((r) => r.capability === "notifications");
		expect(row?.message).toBe("server: Evil [2J 31m FAKE ROW (as bot)");
		const out = lines.join("\n");
		expect(out.includes("\u001b") || out.includes("\u009b")).toBe(false);
	});

	it("labels a notifications row by the implementation's own name when an earlier provider failed to load", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["slack", "discord"] } });
		const loader = makeLoaderWith(loaded, {
			// slack is missing, so only discord loads and `impls` has one entry while the config lists two.
			"@theholocron/holocron-plugin-discord": makePlugin("discord", {
				notifications: { providerName: "discord", whoami: async () => ({ target: "Holocron (as Holonet)" }) },
			}),
		});
		const report = await runDoctor({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });
		const ok = report.rows.find((r) => r.capability === "notifications" && r.status === "ok");
		expect(ok?.provider).toBe("discord");
	});

	it("issues smoke check reports lifecycle readiness and names the unresolved slots", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", issues: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				issues: {
					doctor: async () => ({
						authedAs: "Newton (iamnewton)",
						projectLabel: "Repo: x/y",
						statuses: [],
						lifecycle: [
							{ slot: "inProgress" as const, value: "a", resolved: true, note: "" },
							{ slot: "inReview" as const, value: "b", resolved: false, note: "" },
							{ slot: "done" as const, value: "c", resolved: true, note: "" },
						],
					}),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const issuesRow = report.rows.find((r) => r.capability === ("issues" satisfies CapabilityKey));
		expect(issuesRow?.message).toBe("lifecycle: 2/3 slots ready (unresolved: inReview)");
		// ...and does not repeat the token's user or the repo, which other rows already show.
		expect(issuesRow?.message).not.toContain("iamnewton");
		expect(issuesRow?.message).not.toContain("x/y");
	});

	it("issues smoke check names no unresolved slots when every lifecycle slot is ready", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { issues: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				issues: {
					doctor: async () => ({
						authedAs: "Newton (iamnewton)",
						projectLabel: "Repo: x/y",
						statuses: [],
						lifecycle: [
							{ slot: "inProgress" as const, value: "a", resolved: true, note: "" },
							{ slot: "inReview" as const, value: "b", resolved: true, note: "" },
							{ slot: "done" as const, value: "c", resolved: true, note: "" },
						],
					}),
				},
			}),
		});

		const report = await runDoctor({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const row = report.rows.find((r) => r.capability === ("issues" satisfies CapabilityKey));
		expect(row?.status).toBe("ok");
		expect(row?.message).toBe("lifecycle: 3/3 slots ready");
	});

	it("secrets smoke check reports configured secret count", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: { listSecrets: async () => ["SECRET_A", "SECRET_B", "SECRET_C"] },
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "secrets");
		expect(row?.status).toBe("ok");
		expect(row?.message).toContain("3 configured");
	});

	it("ci smoke check reports most recent run", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { ci: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				ci: {
					listRuns: async () => [{ workflowName: "Test", status: "completed" }],
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "ci");
		expect(row?.status).toBe("ok");
		expect(row?.message).toContain("Test");
		expect(row?.message).toContain("completed");
	});

	it("ci smoke check reports no recent runs when list is empty", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { ci: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				ci: { listRuns: async () => [] },
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "ci");
		expect(row?.status).toBe("ok");
		expect(row?.message).toBe("runs: none recent");
	});

	it("auth smoke check reports whoami reachability, not just describe()'s env keys", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { auth: "clerk" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-clerk": makePlugin("clerk", {
				auth: {
					describe: async () => ({ provider: "clerk", envKeys: ["CLERK_SECRET_KEY"] }),
					whoami: async () => ({ provider: "clerk", details: { userCount: 42 } }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "auth");
		expect(row?.status).toBe("ok");
		expect(row?.message).toContain("clerk");
		expect(row?.message).toContain("userCount=42");
	});

	it("auth smoke check omits the parenthetical when whoami returns no details", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { auth: "clerk" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-clerk": makePlugin("clerk", {
				auth: {
					describe: async () => ({ provider: "clerk", envKeys: ["CLERK_SECRET_KEY"] }),
					whoami: async () => ({ provider: "clerk" }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "auth");
		expect(row?.status).toBe("ok");
		expect(row?.message).toBe("whoami: clerk");
	});

	it("errors smoke check reports org reachability via whoami", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { errors: "sentry" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-sentry": makePlugin("sentry", {
				errors: {
					describe: async () => ({ provider: "sentry", envKeys: ["SENTRY_DSN"] }),
					whoami: async () => ({ org: "theholocron" }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "errors");
		expect(row?.status).toBe("ok");
		expect(row?.message).toContain("theholocron");
	});

	it("errors smoke check falls back to describe when whoami is not implemented", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { errors: "sentry" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-sentry": makePlugin("sentry", {
				errors: {
					describe: async () => ({ provider: "sentry", envKeys: ["SENTRY_DSN"] }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "errors");
		expect(row?.status).toBe("ok");
		expect(row?.message).toContain("sentry");
		expect(row?.message).toContain("SENTRY_DSN");
	});

	it("errors smoke check falls back to describe when whoami returns null (e.g. Sentry's org unset) — not a failure", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { errors: "sentry" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-sentry": makePlugin("sentry", {
				errors: {
					describe: async () => ({ provider: "sentry", envKeys: ["SENTRY_DSN"] }),
					whoami: async () => null,
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "errors");
		expect(row?.status).toBe("ok");
		expect(row?.message).toContain("sentry");
		expect(row?.message).toContain("SENTRY_DSN");
	});

	it("reports fail (not an indefinite hang) when a provider's smoke check never settles", async () => {
		vi.useFakeTimers();
		try {
			const loaded = loadedFrom({
				name: "demo",
				providers: { source: "github" },
			});
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", {
					// Never resolves or rejects — simulates a stalled request.
					source: { whoami: () => new Promise(() => {}) },
				}),
			});

			const reportPromise = runDoctor({
				loaded,
				context: { repoRoot: "/tmp/test" },
				loader,
				print: () => {},
			});
			await vi.advanceTimersByTimeAsync(10_000);
			const report = await reportPromise;

			const row = report.rows.find((r) => r.capability === "source");
			expect(row?.status).toBe("fail");
			expect(row?.message).toMatch(/timed out/);
		} finally {
			vi.useRealTimers();
		}
	});

	it("logs smoke check reports dataset reachability via whoami", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { logs: "axiom" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-axiom": makePlugin("axiom", {
				logs: {
					describe: async () => ({ provider: "axiom", envKeys: ["HOLOCRON_AXIOM_TOKEN"] }),
					whoami: async () => ({ ok: true, dataset: "holocron-ci" }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "logs");
		expect(row?.status).toBe("ok");
		expect(row?.message).toContain("holocron-ci");
	});

	it("logs smoke check falls back to describe when whoami is not implemented", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { logs: "axiom" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-axiom": makePlugin("axiom", {
				logs: {
					describe: async () => ({ provider: "axiom", envKeys: ["HOLOCRON_AXIOM_TOKEN"] }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "logs");
		expect(row?.status).toBe("ok");
		expect(row?.message).toContain("HOLOCRON_AXIOM_TOKEN");
	});

	it("monitoring smoke check reports ok when whoami passes", async () => {
		const loaded = loadedFrom({
			name: "sentinel",
			providers: { monitoring: "checkly" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-checkly": makePlugin("checkly", {
				monitoring: {
					checks: [],
					ensureCheck: async () => ({ check: { id: "chk-1", name: "x" }, alreadyExists: true }),
					whoami: async () => ({ ok: true }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "monitoring");
		expect(row?.status).toBe("ok");
		expect(row?.message).toBe("token: verified");
	});

	it("monitoring smoke check reports fail when whoami fails", async () => {
		const loaded = loadedFrom({
			name: "sentinel",
			providers: { monitoring: "checkly" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-checkly": makePlugin("checkly", {
				monitoring: {
					checks: [],
					ensureCheck: async () => ({ check: { id: "chk-1", name: "x" }, alreadyExists: true }),
					whoami: async () => ({ ok: false }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "monitoring");
		expect(row?.status).toBe("fail");
		expect(row?.message).toBe("token: check failed");
	});

	it("monitoring falls through to skip when the provider defines no whoami", async () => {
		const loaded = loadedFrom({
			name: "sentinel",
			providers: { monitoring: "checkly" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-checkly": makePlugin("checkly", {
				monitoring: {
					checks: [],
					ensureCheck: async () => ({ check: { id: "chk-1", name: "x" }, alreadyExists: true }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "monitoring");
		expect(row?.status).toBe("skip");
		expect(row?.message).toContain("no smoke check defined");
	});

	it("wiki smoke check reports ok (token: configured) when whoami passes", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: "fern" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-fern": makePlugin("fern", {
				wiki: {
					provision: async () => "fern.config.json: org=demo",
					whoami: async () => ({ ok: true }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "wiki");
		expect(row?.status).toBe("ok");
		expect(row?.message).toBe("token: configured");
	});

	it("wiki smoke check reports fail (token: not configured) when whoami fails", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: "fern" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-fern": makePlugin("fern", {
				wiki: {
					provision: async () => "fern.config.json: org=demo",
					whoami: async () => ({ ok: false }),
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "wiki");
		expect(row?.status).toBe("fail");
		expect(row?.message).toBe("token: not configured");
	});

	it("wiki falls through to skip when the provider defines no whoami", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: "fern" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-fern": makePlugin("fern", {
				wiki: {
					provision: async () => "fern.config.json: org=demo",
				},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "wiki");
		expect(row?.status).toBe("skip");
		expect(row?.message).toContain("no smoke check defined");
	});

	it("single-cardinality capability without a smoke check falls through to skip", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { storage: "neon" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-neon": makePlugin("neon", {
				storage: {},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "storage");
		expect(row?.status).toBe("skip");
		expect(row?.message).toContain("no smoke check");
	});
});
