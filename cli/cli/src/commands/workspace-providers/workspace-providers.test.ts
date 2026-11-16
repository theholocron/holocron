import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readWorkspacePackages } from "@theholocron/astromech";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig, resolveConfig } from "../../config/index.js";
import { workspaceProviders } from "./workspace-providers.js";

vi.mock("@theholocron/astromech", async (importOriginal) => {
	const original = await importOriginal<typeof import("@theholocron/astromech")>();
	return { ...original, readWorkspacePackages: vi.fn(original.readWorkspacePackages) };
});

vi.mock("../../config/index.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../config/index.js")>()),
	loadConfig: vi.fn(),
}));

describe("workspaceProviders", () => {
	let root: string;

	function pkg(dir: string, config?: string) {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name: `@x/${dir.replaceAll("/", "-")}` }));
		if (config !== undefined) writeFileSync(join(root, dir, config), "");
	}

	const rootConfig = resolveConfig({
		name: "root",
		providers: { deployment: "cloudflare", cache: "turbo" },
	} as never);
	const loaded = (providers: Record<string, unknown>) =>
		({ filepath: "x", resolved: resolveConfig({ name: "app", providers } as never) }) as never;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "workspace-providers-"));
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
		pkg("apps/a", "holocron.config.ts");
		pkg("apps/b", "holocron.config.json");
		pkg("apps/c");
	});
	afterEach(() => {
		vi.mocked(loadConfig).mockReset();
		rmSync(root, { recursive: true, force: true });
	});

	it("returns the providers the packages' configs name and the root's does not, once each, first options winning", async () => {
		vi.mocked(loadConfig).mockImplementation(async (dir) =>
			String(dir).endsWith("apps/a")
				? loaded({ deployment: ["vercel", { teamId: "team_a" }], dns: "cloudflare", cache: "turbo" })
				: loaded({ deployment: ["vercel", { teamId: "team_b" }], monitoring: "checkly" })
		);
		const found = await workspaceProviders(root, rootConfig);
		expect(found.map((t) => [t.provider, t.options])).toEqual([
			["vercel", { teamId: "team_a" }],
			["checkly", {}],
		]);
		expect(found[0]?.packageName).toBe("@theholocron/holocron-plugin-vercel");
		expect(vi.mocked(loadConfig)).toHaveBeenCalledTimes(2);
	});

	it("skips a package whose config cannot be loaded", async () => {
		vi.mocked(loadConfig).mockRejectedValue(new Error("boom"));
		expect(await workspaceProviders(root, rootConfig)).toEqual([]);
	});

	it("is empty when the workspace's packages cannot be read", async () => {
		vi.mocked(readWorkspacePackages).mockImplementationOnce(() => {
			throw new Error("bad pnpm-workspace.yaml");
		});
		expect(await workspaceProviders(root, rootConfig)).toEqual([]);
		expect(vi.mocked(loadConfig)).not.toHaveBeenCalled();
	});

	it("is empty where there is no workspace", async () => {
		rmSync(join(root, "pnpm-workspace.yaml"));
		expect(await workspaceProviders(join(root, "missing"), rootConfig)).toEqual([]);
	});
});
