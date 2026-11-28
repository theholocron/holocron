import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { MissingTokenError, type MonitoringCheckInput, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import type { WorkspaceMonitoring } from "../workspace-monitoring/index.js";
import { runDoctorMonitoring } from "./doctor-monitoring.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loaded: LoadedConfig = {
	resolved: resolveConfig({
		name: "demo",
		providers: { monitoring: "checkly" },
	} as Raw),
	filepath: "/tmp/test/holocron.config.json",
};

/** `provider: null` makes the package fail to import; `throwOnCreate` makes the constructor throw, as a missing token does. */
function loaderWith(
	provider: Record<string, unknown> | null,
	config: LoadedConfig,
	throwOnCreate?: Error
): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (pkg !== "@theholocron/holocron-plugin-checkly" || !provider) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return {
			createPlugin: () => ({
				name: "checkly",
				capabilities: {
					monitoring: () => {
						if (throwOnCreate) throw throwOnCreate;
						return { providerName: "checkly", ...provider };
					},
				},
			}),
		} as unknown as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(config.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

async function run(provider: Record<string, unknown> | null, config: LoadedConfig = loaded, throwOnCreate?: Error) {
	const lines: string[] = [];
	const report = await runDoctorMonitoring({
		loaded: config,
		context: { repoRoot: "/tmp/test" },
		loader: loaderWith(provider, config, throwOnCreate),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines };
}

const declared = (over: Partial<MonitoringCheckInput> = {}): MonitoringCheckInput => ({
	name: "uptime",
	url: "https://example.com",
	...over,
});

const provider = (checks: MonitoringCheckInput[], have: MonitoringCheckInput[] | (() => Promise<never>)) => ({
	checks,
	listChecks: typeof have === "function" ? have : async () => have,
});

describe("doctor monitoring — what is declared", () => {
	it("says none declared when no monitoring provider is configured", async () => {
		const { report, lines } = await run(null, {
			...loaded,
			resolved: resolveConfig({ name: "demo", providers: {} } as Raw),
		});
		expect(report.status).toBe("ok");
		expect(report.rows.map((r) => [r.id, r.status, r.detail])).toEqual([
			["monitoring-checks", "ok", "none declared"],
		]);
		expect(lines.at(-1)).toBe("1 ok, 0 fail, 0 skipped");
	});

	it("says none declared when the provider has no checks", async () => {
		const { report } = await run(provider([], []));
		expect(report.rows[0]).toMatchObject({ status: "ok", detail: "none declared" });
	});

	it("is a skip, saying why, when the provider is configured but failed to load", async () => {
		const { report } = await run({}, loaded, new Error("CHECKLY_API_KEY is not set"));
		expect(report.status).toBe("skip");
		expect(report.rows[0]!.detail).toMatch(/no `monitoring` provider is available/);
		expect(report.rows[0]!.detail).toMatch(/CHECKLY_API_KEY is not set/);
		expect(report.reason).toBe(report.rows[0]!.detail);
	});
});

describe("doctor monitoring — the checks", () => {
	it("passes when every declared check exists as declared, and ignores one that is not declared", async () => {
		const mine = declared({
			method: "POST",
			frequency: 5,
			activated: true,
			shouldFail: true,
			body: "{}",
			locations: ["us-east-1", "eu-west-1"],
			assertions: [
				{ source: "status_code", comparison: "equals", target: "405" },
				{ source: "header", comparison: "contains", property: "x-a", target: "b" },
			],
		});
		const { report, lines } = await run(
			provider(
				[mine],
				[
					{
						...mine,
						locations: ["eu-west-1", "us-east-1"],
						assertions: [...mine.assertions!].reverse(),
						frequency: 5,
					},
					declared({ name: "by hand" }),
				]
			)
		);
		expect(report.status).toBe("ok");
		expect(report.rows[0]).toMatchObject({ status: "ok", detail: "1 of 1 match" });
		expect(lines[0]).toContain("monitoring checks match");
	});

	it("does not compare a setting the config leaves out, and takes an unstated method as GET", async () => {
		const { report } = await run(
			provider(
				[declared()],
				[declared({ method: "GET", frequency: 1, activated: false, locations: ["x"], body: "b" })]
			)
		);
		expect(report.status).toBe("ok");
	});

	it("fails on a declared check the account does not hold", async () => {
		const { report } = await run(provider([declared(), declared({ name: "second" })], [declared()]));
		expect(report.status).toBe("fail");
		expect(report.rows[0]).toMatchObject({ status: "fail", detail: "1 problem(s)" });
		expect(report.rows[0]!.problems).toEqual(["missing check second"]);
	});

	it("names each setting that differs", async () => {
		const mine = declared({
			frequency: 5,
			activated: true,
			shouldFail: false,
			body: "x",
			locations: ["a"],
			assertions: [
				{ source: "status_code", comparison: "equals", target: "200" },
				{ source: "body", comparison: "contains" },
			],
		});
		const { report, lines } = await run(
			provider(
				[mine],
				[
					{
						name: "uptime",
						url: "https://other.example",
						method: "HEAD",
						frequency: 10,
						activated: false,
						shouldFail: true,
						assertions: [],
					},
				]
			)
		);
		expect(report.rows[0]!.problems).toEqual([
			"check uptime url: declared https://example.com, found https://other.example",
			"check uptime method: declared GET, found HEAD",
			"check uptime frequency: declared 5, found 10",
			"check uptime activated: declared true, found false",
			"check uptime shouldFail: declared false, found true",
			"check uptime body: declared x, found none",
			"check uptime locations: declared a, found none",
			"check uptime assertions: declared body contains; status_code equals 200, found none",
		]);
		expect(lines.some((l) => l.includes("      - check uptime url"))).toBe(true);
	});

	it("fails on a declared tag the check lacks, and ignores an extra tag on the account", async () => {
		const { report } = await run(
			provider([declared({ tags: ["sentinel", "web"] })], [declared({ tags: ["web", "by-hand"] })])
		);
		expect(report.rows[0]!.problems).toEqual(["missing check uptime tag sentinel"]);
		const ok = await run(provider([declared({ tags: ["web"] })], [declared({ tags: ["web", "by-hand"] })]));
		expect(ok.report.status).toBe("ok");
		const none = await run(provider([declared()], [declared({ tags: ["by-hand"] })]));
		expect(none.report.status).toBe("ok");
		// A check the account holds with no tags at all lacks every declared one.
		const untagged = await run(provider([declared({ tags: ["sentinel", "web"] })], [declared()]));
		expect(untagged.report.rows[0]!.problems).toEqual([
			"missing check uptime tag sentinel",
			"missing check uptime tag web",
		]);
	});

	it("fails with the message when the read throws", async () => {
		const { report } = await run(
			provider([declared()], async () => {
				throw new Error("403 Forbidden");
			})
		);
		expect(report.rows[0]).toMatchObject({ status: "fail", detail: "403 Forbidden" });
	});

	it("skips when the read needs a token that is not set", async () => {
		const { report } = await run(
			provider([declared()], async () => {
				throw new MissingTokenError("set CHECKLY_API_KEY");
			})
		);
		expect(report.status).toBe("skip");
		expect(report.rows[0]!.status).toBe("skip");
	});

	it("skips when a plugin reports its token missing as an AuthError", async () => {
		const { report } = await run(
			provider([declared()], async () => {
				throw Object.assign(new Error("no Checkly token found"), { name: "AuthError" });
			})
		);
		expect(report.rows[0]).toMatchObject({ status: "skip", detail: "no Checkly token found" });
	});

	it("skips when the provider cannot list its checks", async () => {
		const { report } = await run({ checks: [declared()] });
		expect(report.status).toBe("skip");
		expect(report.rows[0]).toMatchObject({ status: "skip", detail: "provider does not implement listChecks" });
	});
});

describe("doctor monitoring — heartbeats", () => {
	const beat = { name: "check-tokens", period: 1, periodUnit: "days", grace: 2, graceUnit: "hours" };

	it("adds a heartbeat row after the checks row, and fails on a mismatch", async () => {
		const { report, lines } = await run({
			...provider([declared()], [declared()]),
			heartbeats: [beat],
			listHeartbeats: async () => [{ ...beat, period: 7 }],
		});
		expect(report.rows.map((r) => r.id)).toEqual(["monitoring-checks", "monitoring-heartbeats"]);
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toContain("heartbeat check-tokens period: declared 1 days, found 7 days");
	});

	it("adds no row when no heartbeat is declared", async () => {
		const { report } = await run(provider([declared()], [declared()]));
		expect(report.rows.map((r) => r.id)).toEqual(["monitoring-checks"]);
	});
});

describe("doctor monitoring — defaults", () => {
	it("prints and logs without an injected printer, logger or loader", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const report = await runDoctorMonitoring({
			loaded: { ...loaded, resolved: resolveConfig({ name: "demo", providers: {} } as Raw) },
			context: { repoRoot: "/tmp/test" },
		});
		expect(report.status).toBe("ok");
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
});

describe("doctor monitoring — checks no config declares", () => {
	const dashboard = { name: "The Holocron", tags: ["docs", "sentinel"] };
	const workspace = (over: Partial<WorkspaceMonitoring> = {}): WorkspaceMonitoring => ({
		checks: [],
		dashboards: [],
		statusPages: [],
		unreadable: [],
		...over,
	});
	async function runUndeclared(provider: Record<string, unknown>, ws: WorkspaceMonitoring) {
		const lines: string[] = [];
		const report = await runDoctorMonitoring({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader: loaderWith(provider, loaded),
			workspaceMonitoring: ws,
			print: (l) => lines.push(stripVTControlCharacters(l)),
			logger: fakeLogger(),
		});
		return { report, lines };
	}
	const docs = declared({ name: "docs", tags: ["docs"] });
	const sentinel = declared({ name: "sentinel", tags: ["sentinel"] });
	const dashboards = { dashboards: [dashboard] };

	it("is ok when a check a declared dashboard picks up is declared in a workspace package", async () => {
		const { report } = await runUndeclared(
			{ ...provider([docs], [docs, sentinel]), ...dashboards },
			workspace({ checks: [sentinel] })
		);
		expect(report.rows.find((r) => r.id === "monitoring-undeclared")).toMatchObject({
			status: "ok",
			detail: "2 compared, all declared",
		});
	});

	it("names an undeclared check as an info row and does not fail the run", async () => {
		const stray = declared({ name: "Docs staging", tags: ["docs"] });
		const { report, lines } = await runUndeclared(
			{ ...provider([docs], [docs, stray]), ...dashboards },
			workspace()
		);
		expect(report.status).toBe("ok");
		expect(report.rows.find((r) => r.id === "monitoring-undeclared")?.status).toBe("skip");
		expect(lines.join("\n")).toContain("declared nowhere: Docs staging (docs)");
	});

	it("reads the account's checks once", async () => {
		const listChecks = vi.fn(async () => [docs]);
		await runUndeclared({ checks: [docs], listChecks, ...dashboards }, workspace());
		expect(listChecks).toHaveBeenCalledTimes(1);
	});

	it("makes no row when the checks could not be listed", async () => {
		const { report } = await runUndeclared(
			{ ...provider([docs], async () => Promise.reject(new Error("boom"))), ...dashboards },
			workspace()
		);
		expect(report.rows.map((r) => r.id)).not.toContain("monitoring-undeclared");
	});
});
