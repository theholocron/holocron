import { describe, expect, it, vi } from "vitest";

import type { CapabilityKey } from "../plugin/capabilities.js";
import { runDoctor } from "../commands/doctor.js";
import { resolveConfig } from "../config/config.js";
import type { LoadedConfig } from "../config/load-config.js";
import { type PluginImporter, PluginLoader } from "../plugin/loader.js";

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
		expect(vaultRow?.message).toContain("2 keys");

		expect(report.summary).toEqual({ ok: 2, fail: 0, skip: 0 });
		expect(lines.join("\n")).toContain("Holocron doctor — demo");
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

	it("issues smoke check reports resolved lifecycle slot count", async () => {
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
		expect(issuesRow?.message).toContain("2/3 lifecycle slots ready");
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
		expect(row?.message).toContain("no recent runs");
	});

	it("auth smoke check reports provider and env keys", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { auth: "clerk" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-clerk": makePlugin("clerk", {
				auth: {
					describe: async () => ({ provider: "clerk", envKeys: ["CLERK_SECRET_KEY"] }),
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
		expect(row?.message).toContain("CLERK_SECRET_KEY");
	});

	it("single-cardinality capability without a smoke check falls through to skip", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {},
			}),
		});

		const report = await runDoctor({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const row = report.rows.find((r) => r.capability === "deployment");
		expect(row?.status).toBe("skip");
		expect(row?.message).toContain("no smoke check");
	});
});
