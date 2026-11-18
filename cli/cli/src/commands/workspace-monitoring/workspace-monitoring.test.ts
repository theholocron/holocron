import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import type { PluginImporter } from "../../plugin/index.js";
import { readWorkspaceConfigs } from "../workspace-configs/index.js";
import { readWorkspaceMonitoring } from "./workspace-monitoring.js";

vi.mock("../workspace-configs/index.js", () => ({ readWorkspaceConfigs: vi.fn() }));
const context = { repoRoot: "/repo" };

/** A package config naming `checkly` as its monitoring provider, whose plugin declares what `declares` gives. */
function pkg(path: string, declares: Record<string, unknown> | null) {
	return {
		path,
		dir: `/repo/${path}`,
		resolved: resolveConfig({ name: path, providers: { monitoring: "checkly" } } as never),
		declares,
	};
}

/** The importer is shared by every package's loader, so it answers by the provider's options, which carry the package. */
vi.mock("../../plugin/loader/loader.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../plugin/loader/loader.js")>();
	return {
		...original,
		PluginLoader: class extends original.PluginLoader {
			constructor(config: never, ctx: never, _importer: never, options: never) {
				super(config, ctx, fakeImporter(config), options);
			}
		},
	};
});

let declaredBy = new Map<string, Record<string, unknown> | null>();
function fakeImporter(config: { name: string }): PluginImporter {
	return (async () => {
		const declares = declaredBy.get(config.name);
		if (!declares) throw new Error("MODULE_NOT_FOUND");
		return {
			createPlugin: () => ({
				name: "checkly",
				capabilities: { monitoring: () => ({ providerName: "checkly", checks: [], ...declares }) },
			}),
		};
	}) as unknown as PluginImporter;
}

async function read(...pkgs: ReturnType<typeof pkg>[]) {
	declaredBy = new Map(pkgs.map((p) => [p.path, p.declares]));
	vi.mocked(readWorkspaceConfigs).mockResolvedValue(pkgs as never);
	return readWorkspaceMonitoring(context);
}

describe("readWorkspaceMonitoring", () => {
	it("gathers the checks, dashboards and status pages every package declares", async () => {
		const found = await read(
			pkg("apps/a", {
				checks: [{ name: "a", url: "https://a" }],
				dashboards: [{ name: "D", tags: ["a"] }],
				statusPages: [{ name: "P", slug: "p", components: [{ name: "A", tags: ["a"] }] }],
			}),
			pkg("apps/b", { checks: [{ name: "b", url: "https://b" }] })
		);
		expect(found.checks.map((c) => c.name)).toEqual(["a", "b"]);
		expect(found.dashboards.map((d) => d.name)).toEqual(["D"]);
		expect(found.statusPages.map((p) => p.name)).toEqual(["P"]);
		expect(found.unreadable).toEqual([]);
	});

	it("reads nothing from a package with no monitoring provider", async () => {
		declaredBy = new Map();
		vi.mocked(readWorkspaceConfigs).mockResolvedValue([
			{ path: "apps/a", dir: "/repo/apps/a", resolved: resolveConfig({ name: "a", providers: {} } as never) },
		]);
		expect(await readWorkspaceMonitoring(context)).toEqual({
			checks: [],
			dashboards: [],
			statusPages: [],
			unreadable: [],
		});
	});

	it("names a package whose config cannot be loaded", async () => {
		declaredBy = new Map();
		vi.mocked(readWorkspaceConfigs).mockResolvedValue([{ path: "apps/a", dir: "/repo/apps/a", error: "boom" }]);
		expect((await readWorkspaceMonitoring(context)).unreadable).toEqual(["apps/a: boom"]);
	});

	it("names a package whose monitoring provider cannot be built", async () => {
		const found = await read(pkg("apps/a", null));
		expect(found.unreadable).toHaveLength(1);
		expect(found.unreadable[0]).toMatch(/^apps\/a: its monitoring provider is not available \(`checkly` failed/);
	});
});
