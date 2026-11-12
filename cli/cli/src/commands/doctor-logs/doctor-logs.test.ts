import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import type { Logs, LogsDataset, PluginLoader } from "../../plugin/index.js";
import { runDoctorLogs } from "./doctor-logs.js";

const SECRET = "xaat-SECRET-TOKEN-VALUE";

interface Fakes {
	logs?: Partial<Logs> | null;
	config?: Record<string, unknown>;
	loadFailures?: { key: string; provider: string; error: Error }[];
	datasets?: Record<string, LogsDataset | Error>;
}

class AuthError extends Error {
	override name = "AuthError";
}

async function run(fakes: Fakes = {}) {
	const lines: string[] = [];
	const datasets = fakes.datasets ?? {
		holocron: { exists: true, retentionDays: 90 },
		"holocron-sentinel": { exists: true, retentionDays: 30 },
	};
	const logs =
		fakes.logs === null
			? undefined
			: ({
					providerName: "axiom",
					key: "logs",
					describe: async () => ({ provider: "axiom", envKeys: [] }),
					checkToken: async () => ({ ok: true }),
					readDataset: async (name: string) => {
						const found = datasets[name];
						if (found instanceof Error) throw found;
						return found ?? { exists: false };
					},
					...fakes.logs,
				} as Logs);
	const loader = {
		load: async () => undefined,
		loadFailures: () => fakes.loadFailures ?? [],
		loadedKeys: () => (logs ? ["logs"] : []),
		has: (key: string) => key === "logs" && logs !== undefined,
		get: () => logs,
	} as unknown as PluginLoader;
	const report = await runDoctorLogs({
		loaded: {
			resolved: resolveConfig({ name: "demo", org: "acme", providers: {}, ...fakes.config } as never),
			filepath: "/tmp/x",
		},
		context: { repoRoot: "/tmp" },
		loader,
		print: (line) => lines.push(line),
		logger: { info: vi.fn() } as never,
	});
	return { report, text: lines.join("\n") };
}

const row = (report: Awaited<ReturnType<typeof run>>["report"], id: string) => report.rows.find((r) => r.id === id)!;

beforeEach(() => {
	vi.stubEnv("HOLOCRON_AXIOM_DATASET", "holocron");
	vi.stubEnv("SENTINEL_AXIOM_DATASET", "holocron-sentinel");
	vi.stubEnv("HOLOCRON_AXIOM_ORG", "acme-org");
	vi.stubEnv("AXIOM_DATASET", "");
	vi.stubEnv("AXIOM_ORG", "");
	vi.stubEnv("HOLOCRON_AXIOM_TOKEN", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("doctor logs", () => {
	it("passes when the token is accepted, both datasets exist and the org is set", async () => {
		const { report, text } = await run();
		expect(report.status).toBe("ok");
		expect(row(report, "logs:token")).toMatchObject({ status: "ok" });
		expect(row(report, "logs:dataset:cli")).toMatchObject({ status: "ok", detail: "holocron exists" });
		expect(row(report, "logs:dataset:sentinel")).toMatchObject({
			status: "ok",
			detail: "holocron-sentinel exists",
		});
		expect(row(report, "logs:org")).toMatchObject({ status: "ok" });
		expect(report.summary).toEqual({ ok: 4, fail: 0, skip: 2 });
		expect(text).not.toContain(SECRET);
	});

	it("shows each dataset's retention as an info row that counts as skipped", async () => {
		const { report } = await run();
		expect(row(report, "logs:retention:cli")).toMatchObject({ status: "skip" });
		expect(row(report, "logs:retention:cli").detail).toContain("retention: 90 days for holocron");
		expect(row(report, "logs:retention:cli").detail).toContain("ADR-0019");
		expect(row(report, "logs:retention:sentinel").detail).toContain("30 days");
	});

	it("says so when the provider reports no retention, rather than guessing", async () => {
		const { report } = await run({
			datasets: { holocron: { exists: true }, "holocron-sentinel": { exists: true } },
		});
		expect(row(report, "logs:retention:cli").detail).toContain("did not report one");
	});

	it("fails on a dataset the provider says is missing, naming the fix, and never creates it", async () => {
		const ensureDataset = vi.fn();
		const { report } = await run({
			logs: { ensureDataset },
			datasets: { "holocron-sentinel": { exists: true } },
		});
		expect(report.status).toBe("fail");
		expect(row(report, "logs:dataset:cli")).toMatchObject({ status: "fail" });
		expect(row(report, "logs:dataset:cli").problems[0]).toContain("holocron setup");
		expect(ensureDataset).not.toHaveBeenCalled();
	});

	it("tells the user to create Sentinel's dataset in Axiom", async () => {
		const { report } = await run({ datasets: { holocron: { exists: true } } });
		expect(row(report, "logs:dataset:sentinel").problems[0]).toContain("create it in Axiom");
	});

	it("skips a dataset whose name is not set here", async () => {
		vi.stubEnv("SENTINEL_AXIOM_DATASET", "");
		const { report } = await run();
		expect(row(report, "logs:dataset:sentinel")).toMatchObject({ status: "skip" });
		expect(row(report, "logs:dataset:sentinel").detail).toContain("SENTINEL_AXIOM_DATASET is not set");
		expect(report.status).toBe("ok");
	});

	it("resolves the CLI's dataset through the logger's chain, including the config override and the bare name", async () => {
		vi.stubEnv("HOLOCRON_AXIOM_DATASET", "");
		const viaConfig = await run({
			config: { log: { axiom: { dataset: "from-config" } } },
			datasets: { "from-config": { exists: true }, "holocron-sentinel": { exists: true } },
		});
		expect(row(viaConfig.report, "logs:dataset:cli").detail).toBe("from-config exists");
		vi.stubEnv("AXIOM_DATASET", "bare-name");
		const viaBare = await run({
			datasets: { "bare-name": { exists: true }, "holocron-sentinel": { exists: true } },
		});
		expect(row(viaBare.report, "logs:dataset:cli").detail).toBe("bare-name exists");
	});

	it("checks the service dev.serve.logging names too", async () => {
		vi.stubEnv("COMLINK_AXIOM_DATASET", "holocron-comlink");
		const { report } = await run({
			config: {
				dev: { serve: { handler: "./h.ts", logging: { tokenVar: "T", datasetVar: "COMLINK_AXIOM_DATASET" } } },
			},
			datasets: { holocron: { exists: true }, "holocron-sentinel": { exists: true } },
		});
		expect(row(report, "logs:dataset:comlink")).toMatchObject({ status: "fail" });
	});

	it("does not list a dev.serve.logging dataset that is already a checked one", async () => {
		const { report } = await run({
			config: {
				dev: { serve: { handler: "./h.ts", logging: { tokenVar: "T", datasetVar: "SENTINEL_AXIOM_DATASET" } } },
			},
		});
		expect(report.rows.filter((r) => r.id.startsWith("logs:dataset:"))).toHaveLength(2);
	});

	it("fails on a token the provider refuses, and does not look for datasets with it", async () => {
		const { report } = await run({
			logs: { checkToken: async () => ({ ok: false, reason: "Axiom refused the token (401)" }) },
		});
		expect(report.status).toBe("fail");
		expect(row(report, "logs:token")).toMatchObject({ status: "fail", detail: "Axiom refused the token (401)" });
		expect(row(report, "logs:dataset:cli")).toMatchObject({ status: "skip" });
	});

	it("falls back to a generic reason for a refused token without one", async () => {
		const { report } = await run({ logs: { checkToken: async () => ({ ok: false }) } });
		expect(row(report, "logs:token").detail).toBe("axiom refused the token");
	});

	it("skips, not fails, when the token cannot be read", async () => {
		const { report } = await run({
			logs: {
				checkToken: async () => {
					throw new AuthError("no Axiom token found");
				},
			},
		});
		expect(report.status).toBe("ok");
		expect(row(report, "logs:token")).toMatchObject({ status: "skip", detail: "no Axiom token found" });
		expect(row(report, "logs:dataset:cli").detail).toContain("the token is not usable");
	});

	it("skips, not fails, when the token check cannot be made, and still reads the datasets", async () => {
		const { report } = await run({
			logs: {
				checkToken: async () => {
					throw new Error("network down");
				},
			},
		});
		expect(row(report, "logs:token")).toMatchObject({ status: "skip" });
		expect(row(report, "logs:token").detail).toContain("could not check the token: network down");
		expect(row(report, "logs:dataset:cli")).toMatchObject({ status: "ok" });
	});

	it("skips a dataset it cannot read, with the reason, instead of failing", async () => {
		const { report } = await run({
			datasets: { holocron: new Error("403 forbidden"), "holocron-sentinel": new AuthError("no token") },
		});
		expect(report.status).toBe("ok");
		expect(row(report, "logs:dataset:cli")).toMatchObject({ status: "skip" });
		expect(row(report, "logs:dataset:cli").detail).toContain("could not read holocron: 403 forbidden");
		expect(row(report, "logs:dataset:sentinel").detail).toBe("no token");
	});

	it("skips what the provider cannot do", async () => {
		const { report } = await run({ logs: { checkToken: undefined, readDataset: undefined } });
		expect(row(report, "logs:token")).toMatchObject({ status: "skip", detail: "axiom cannot check a token" });
		expect(row(report, "logs:dataset:cli").detail).toBe("axiom cannot read a dataset");
		expect(report.status).toBe("ok");
	});

	it("skips the org when it is not set here, naming the variables and not failing", async () => {
		vi.stubEnv("HOLOCRON_AXIOM_ORG", "");
		const { report } = await run();
		expect(row(report, "logs:org")).toMatchObject({ status: "skip" });
		expect(row(report, "logs:org").detail).toContain("HOLOCRON_AXIOM_ORG (or AXIOM_ORG)");
		expect(report.status).toBe("ok");
	});

	it("accepts the bare AXIOM_ORG", async () => {
		vi.stubEnv("HOLOCRON_AXIOM_ORG", "");
		vi.stubEnv("AXIOM_ORG", "acme-org");
		expect(row((await run()).report, "logs:org").status).toBe("ok");
	});

	it("skips with the reason when there is no logs provider", async () => {
		const { report } = await run({ logs: null });
		expect(report.status).toBe("skip");
		expect(report.reason).toContain("no `logs` provider is configured");
	});

	it("names a logs plugin that failed to load", async () => {
		const { report } = await run({
			logs: null,
			loadFailures: [{ key: "logs", provider: "axiom", error: new Error("Cannot find package") }],
		});
		expect(report.reason).toContain("`axiom` failed to load");
	});

	it("builds its own loader, printer and logger when none are given, and skips with no logs provider", async () => {
		const say = vi.spyOn(console, "log").mockImplementation(() => undefined);
		try {
			const report = await runDoctorLogs({
				loaded: {
					resolved: resolveConfig({ name: "demo", org: "acme", providers: {} } as never),
					filepath: "/tmp/x",
				},
				context: { repoRoot: "/tmp" },
			});
			expect(report.status).toBe("skip");
			expect(say).toHaveBeenCalled();
		} finally {
			say.mockRestore();
		}
	});

	it("prints no secret value, only names and counts", async () => {
		const { text } = await run();
		expect(text).not.toContain(SECRET);
		expect(text).toContain("holocron-sentinel");
	});
});
