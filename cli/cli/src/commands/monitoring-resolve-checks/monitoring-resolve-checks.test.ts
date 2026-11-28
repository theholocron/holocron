import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type MonitoringCheckInput, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runMonitoringResolveChecks } from "./monitoring-resolve-checks.js";

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
	const importer = (async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	}) as PluginImporter;
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer);
}

const CHECK_A: MonitoringCheckInput = {
	name: "uptime",
	url: "https://prod.example.com",
	assertions: [{ source: "status_code", comparison: "equals", target: "200" }],
};

describe("runMonitoringResolveChecks", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "resolve-checks-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("writes the resolved checks to the given file as JSON, and nothing else", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { monitoring: ["checkly", { checks: [CHECK_A] }] } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-checkly": makePlugin("checkly", {
				monitoring: { providerName: "checkly", checks: [CHECK_A] },
			}),
		});
		const outFile = join(dir, "checks.json");
		const lines: string[] = [];

		await runMonitoringResolveChecks({
			loaded,
			context: { repoRoot: "/tmp/test" },
			outFile,
			loader,
			print: (l) => lines.push(l),
		});

		const written = JSON.parse(await readFile(outFile, "utf8"));
		expect(written).toEqual([CHECK_A]);
		expect(lines.some((l) => l.includes("Resolved 1 monitoring check"))).toBe(true);
	});

	it("writes an empty array, not an error, when no checks are configured", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { monitoring: ["checkly", { checks: [] }] } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-checkly": makePlugin("checkly", {
				monitoring: { providerName: "checkly", checks: [] },
			}),
		});
		const outFile = join(dir, "checks.json");

		await runMonitoringResolveChecks({
			loaded,
			context: { repoRoot: "/tmp/test" },
			outFile,
			loader,
			print: () => {},
		});

		expect(JSON.parse(await readFile(outFile, "utf8"))).toEqual([]);
	});

	it("defaults print to console.log when none is injected", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { monitoring: ["checkly", { checks: [CHECK_A] }] } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-checkly": makePlugin("checkly", {
				monitoring: { providerName: "checkly", checks: [CHECK_A] },
			}),
		});
		const outFile = join(dir, "checks.json");

		await runMonitoringResolveChecks({ loaded, context: { repoRoot: "/tmp/test" }, outFile, loader });

		expect(JSON.parse(await readFile(outFile, "utf8"))).toEqual([CHECK_A]);
	});

	it("throws when the monitoring capability is not declared at all, same as resolveMonitoringChecks", async () => {
		const loaded = loadedFrom({ name: "demo", providers: {} });
		const loader = makeLoaderWith(loaded, {});
		const outFile = join(dir, "checks.json");

		const err = await runMonitoringResolveChecks({
			loaded,
			context: { repoRoot: "/tmp/test" },
			outFile,
			loader,
			print: () => {},
		}).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/monitoring.*is not loaded/);
	});
});
