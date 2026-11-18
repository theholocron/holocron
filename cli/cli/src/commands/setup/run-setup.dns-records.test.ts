import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runSetup } from "./run-setup.js";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "setup-dns-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

function setup(dryRun = false) {
	const upsertRecord = vi.fn(async (_d: string, r: unknown) => r);
	const loaded: LoadedConfig = {
		resolved: resolveConfig({ name: "demo", providers: { dns: "cloudflare" } }),
		filepath: join(root, "holocron.config.json"),
	};
	const modules: Record<string, unknown> = {
		"@theholocron/holocron-plugin-cloudflare": {
			createPlugin: () => ({
				name: "cloudflare",
				capabilities: { dns: () => ({ providerName: "cloudflare", key: "dns", upsertRecord }) },
			}),
		},
	};
	const loader = new PluginLoader(loaded.resolved, { repoRoot: root, repo: "acme/demo" }, (async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg];
	}) as unknown as PluginImporter);
	const lines: string[] = [];
	const report = runSetup({ loaded, context: { repoRoot: root, dryRun }, loader, print: (l) => void lines.push(l) });
	return { report, upsertRecord, lines };
}

describe("runSetup dns records", () => {
	it("makes the records the list holds, under a dns section", async () => {
		await mkdir(join(root, ".holocron"));
		await writeFile(
			join(root, ".holocron", "dns-records.json"),
			JSON.stringify([{ type: "CNAME", name: "status.example.dev", value: "t.example.net" }])
		);
		const { report, upsertRecord, lines } = setup();
		const rows = (await report).steps.filter((s) => s.capability === "dns");
		expect(rows.map((r) => [r.step, r.status])).toEqual([["dns CNAME status.example.dev", "ok"]]);
		expect(upsertRecord).toHaveBeenCalledOnce();
		expect(lines.some((l) => l.includes("dns"))).toBe(true);
	});

	it("has no dns section without a list", async () => {
		const { report } = setup();
		expect((await report).steps.filter((s) => s.capability === "dns")).toEqual([]);
	});
});
