import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../config/config.js";
import type { LoadedConfig } from "../config/load-config.js";
import type { MonitoringCheckInput } from "../plugin/capabilities.js";
import { type PluginImporter, PluginLoader } from "../plugin/loader.js";
import { runMonitoringCheck } from "./monitoring-check.js";

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
