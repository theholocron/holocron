import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type MonitoringCheckInput, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { reportChecks, resolveMonitoringChecks, runMonitoringCheck } from "./monitoring-check.js";

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return { resolved: resolveConfig(rawConfig), filepath: "/tmp/test/holocron.config.json" };
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

const CHECK_A: MonitoringCheckInput = {
	name: "uptime",
	url: "https://prod.example.com",
	assertions: [{ source: "status_code", comparison: "equals", target: "200" }],
};

const CHECK_B: MonitoringCheckInput = {
	name: "signature",
	url: "https://prod.example.com",
	method: "POST",
	shouldFail: true,
	assertions: [{ source: "status_code", comparison: "equals", target: "401" }],
};

function loadedWithMonitoring(checks: MonitoringCheckInput[]) {
	const loaded = loadedFrom({ name: "demo", providers: { monitoring: ["checkly", { checks }] } });
	const loader = makeLoaderWith(loaded, {
		"@theholocron/holocron-plugin-checkly": makePlugin("checkly", {
			monitoring: { providerName: "checkly", checks },
		}),
	});
	return { loaded, loader };
}

describe("runMonitoringCheck", () => {
	it("reports ok when every configured check passes against the override url", async () => {
		const { loaded, loader } = loadedWithMonitoring([CHECK_A, CHECK_B]);
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });
		const lines: string[] = [];

		const report = await runMonitoringCheck({
			loaded,
			context: { repoRoot: "/tmp/test" },
			url: "https://pr-preview.example.com",
			loader,
			print: (l) => lines.push(l),
			runCheck,
		});

		expect(report.status).toBe("ok");
		expect(report.checks).toEqual([
			{ name: "uptime", passed: true, failures: [] },
			{ name: "signature", passed: true, failures: [] },
		]);
		expect(runCheck).toHaveBeenCalledWith(CHECK_A, { url: "https://pr-preview.example.com" });
		expect(runCheck).toHaveBeenCalledWith(CHECK_B, { url: "https://pr-preview.example.com" });
		expect(lines.some((l) => l.includes("2 passed, 0 failed"))).toBe(true);
	});

	it("forwards headers to every check's runCheck call when given", async () => {
		const { loaded, loader } = loadedWithMonitoring([CHECK_A, CHECK_B]);
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });

		await runMonitoringCheck({
			loaded,
			context: { repoRoot: "/tmp/test" },
			url: "https://pr-preview.example.com",
			headers: { "x-vercel-protection-bypass": "secret" },
			loader,
			runCheck,
		});

		expect(runCheck).toHaveBeenCalledWith(CHECK_A, {
			url: "https://pr-preview.example.com",
			headers: { "x-vercel-protection-bypass": "secret" },
		});
		// CHECK_B too -- a loop-index or "first call only" bug upstream would
		// still pass if only CHECK_A's call were asserted.
		expect(runCheck).toHaveBeenCalledWith(CHECK_B, {
			url: "https://pr-preview.example.com",
			headers: { "x-vercel-protection-bypass": "secret" },
		});
		expect(runCheck).toHaveBeenCalledTimes(2);
	});

	it("omits headers from the runCheck call entirely when none are given", async () => {
		const { loaded, loader } = loadedWithMonitoring([CHECK_A]);
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });

		await runMonitoringCheck({
			loaded,
			context: { repoRoot: "/tmp/test" },
			url: "https://pr-preview.example.com",
			loader,
			runCheck,
		});

		expect(runCheck).toHaveBeenCalledWith(CHECK_A, { url: "https://pr-preview.example.com" });
	});

	it("reports fail and lists the failure reasons when a check doesn't pass", async () => {
		const { loaded, loader } = loadedWithMonitoring([CHECK_A]);
		const runCheck = vi.fn().mockResolvedValue({ passed: false, status: 500, failures: ["HTTP 500"] });
		const lines: string[] = [];

		const report = await runMonitoringCheck({
			loaded,
			context: { repoRoot: "/tmp/test" },
			url: "https://pr-preview.example.com",
			loader,
			print: (l) => lines.push(l),
			runCheck,
		});

		expect(report.status).toBe("fail");
		expect(report.checks).toEqual([{ name: "uptime", passed: false, failures: ["HTTP 500"] }]);
		expect(lines.some((l) => l.includes("0 passed, 1 failed"))).toBe(true);
		expect(lines.some((l) => l.includes("HTTP 500"))).toBe(true);
	});

	it("reports fail (never passed) when the request itself errors", async () => {
		const { loaded, loader } = loadedWithMonitoring([CHECK_A]);
		const runCheck = vi.fn().mockResolvedValue({ passed: false, failures: [], requestError: "ECONNREFUSED" });

		const report = await runMonitoringCheck({
			loaded,
			context: { repoRoot: "/tmp/test" },
			url: "https://pr-preview.example.com",
			loader,
			print: () => {},
			runCheck,
		});

		expect(report.status).toBe("fail");
		expect(report.checks).toEqual([{ name: "uptime", passed: false, failures: [], requestError: "ECONNREFUSED" }]);
	});

	it("fails (never silently ok) when zero checks are configured — an unvalidating gate is worse than an error", async () => {
		const { loaded, loader } = loadedWithMonitoring([]);
		const lines: string[] = [];

		const report = await runMonitoringCheck({
			loaded,
			context: { repoRoot: "/tmp/test" },
			url: "https://pr-preview.example.com",
			loader,
			print: (l) => lines.push(l),
		});

		expect(report).toEqual({ status: "fail", checks: [] });
		expect(lines.some((l) => l.includes("no monitoring checks configured"))).toBe(true);
	});

	it("throws a clear error when the monitoring capability is not declared at all", async () => {
		const loaded = loadedFrom({ name: "demo", providers: {} });
		const loader = makeLoaderWith(loaded, {});

		const err = await runMonitoringCheck({
			loaded,
			context: { repoRoot: "/tmp/test" },
			url: "https://pr-preview.example.com",
			loader,
			print: () => {},
		}).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/monitoring.*is not loaded/);
	});

	it("surfaces the real provider load error, not a generic 'not configured' message", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { monitoring: ["checkly", { checks: [CHECK_A] }] },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-checkly": {
				createPlugin: () => ({
					name: "checkly",
					capabilities: {
						monitoring: () => {
							throw new Error("Checkly GET /accounts failed: 401 invalid token");
						},
					},
				}),
			},
		});

		const err = await runMonitoringCheck({
			loaded,
			context: { repoRoot: "/tmp/test" },
			url: "https://pr-preview.example.com",
			loader,
			print: () => {},
		}).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain("invalid token");
	});

	it("defaults print to console.log when none is injected", async () => {
		const { loaded, loader } = loadedWithMonitoring([CHECK_A]);
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			await runMonitoringCheck({
				loaded,
				context: { repoRoot: "/tmp/test" },
				url: "https://pr-preview.example.com",
				loader,
				runCheck,
			});
			expect(logSpy).toHaveBeenCalled();
			expect(logSpy.mock.calls.some((call) => String(call[0]).includes("1 passed, 0 failed"))).toBe(true);
		} finally {
			logSpy.mockRestore();
		}
	});

	it("constructs a real PluginLoader when none is injected, surfacing its own not-configured error", async () => {
		const loaded = loadedFrom({ name: "demo", providers: {} });

		const err = await runMonitoringCheck({
			loaded,
			context: { repoRoot: "/tmp/test" },
			url: "https://pr-preview.example.com",
			print: () => {},
		}).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/monitoring.*is not loaded/);
	});

	it("logs a structured summary line via the injected logger", async () => {
		const { loaded, loader } = loadedWithMonitoring([CHECK_A]);
		const log = fakeLogger();
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });

		await runMonitoringCheck({
			loaded,
			context: { repoRoot: "/tmp/test" },
			url: "https://pr-preview.example.com",
			loader,
			print: () => {},
			logger: log,
			runCheck,
		});

		expect(log.info).toHaveBeenCalledWith(
			expect.objectContaining({ url: "https://pr-preview.example.com", total: 1, failed: 0, status: "ok" }),
			"monitoring check: done"
		);
	});
});

describe("resolveMonitoringChecks", () => {
	it("returns the configured checks without making any HTTP request", async () => {
		const { loaded, loader } = loadedWithMonitoring([CHECK_A, CHECK_B]);
		const checks = await resolveMonitoringChecks({ loaded, context: { repoRoot: "/tmp/test" }, loader });
		expect(checks).toEqual([CHECK_A, CHECK_B]);
	});

	it("throws when the monitoring capability is not declared at all — same guard runMonitoringCheck relies on", async () => {
		const loaded = loadedFrom({ name: "demo", providers: {} });
		const loader = makeLoaderWith(loaded, {});
		const err = await resolveMonitoringChecks({ loaded, context: { repoRoot: "/tmp/test" }, loader }).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/monitoring.*is not loaded/);
	});
});

describe("reportChecks", () => {
	it("reports ok against an already-resolved check list, with no config/loader involved at all", async () => {
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });
		const lines: string[] = [];

		const report = await reportChecks({
			checks: [CHECK_A, CHECK_B],
			url: "https://pr-preview.example.com",
			print: (l) => lines.push(l),
			runCheck,
		});

		expect(report.status).toBe("ok");
		expect(runCheck).toHaveBeenCalledTimes(2);
		expect(lines.some((l) => l.includes("2 passed, 0 failed"))).toBe(true);
	});

	it("forwards headers to every resolved check's runCheck call", async () => {
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });

		await reportChecks({
			checks: [CHECK_A, CHECK_B],
			url: "https://pr-preview.example.com",
			headers: { "x-vercel-protection-bypass": "secret" },
			runCheck,
		});

		expect(runCheck).toHaveBeenCalledWith(CHECK_A, {
			url: "https://pr-preview.example.com",
			headers: { "x-vercel-protection-bypass": "secret" },
		});
		expect(runCheck).toHaveBeenCalledWith(CHECK_B, {
			url: "https://pr-preview.example.com",
			headers: { "x-vercel-protection-bypass": "secret" },
		});
	});

	it("fails (never silently ok) when given an empty check list", async () => {
		const lines: string[] = [];
		const report = await reportChecks({
			checks: [],
			url: "https://pr-preview.example.com",
			print: (l) => lines.push(l),
		});
		expect(report.status).toBe("fail");
		expect(lines.some((l) => l.includes("nothing to validate"))).toBe(true);
	});
});
