import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readWorkspacePackages } from "@theholocron/astromech";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig, resolveConfig } from "../../config/index.js";
import { readWorkspaceConfigs } from "./workspace-configs.js";

vi.mock("@theholocron/astromech", async (importOriginal) => {
	const original = await importOriginal<typeof import("@theholocron/astromech")>();
	return { ...original, readWorkspacePackages: vi.fn(original.readWorkspacePackages) };
});

vi.mock("../../config/index.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../config/index.js")>()),
	loadConfig: vi.fn(),
}));

describe("readWorkspaceConfigs", () => {
	let root: string;

	function pkg(dir: string, config?: string) {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name: `@x/${dir.replaceAll("/", "-")}` }));
		if (config !== undefined) writeFileSync(join(root, dir, config), "");
	}

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "workspace-configs-"));
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
		pkg("apps/a", "holocron.config.ts");
		pkg("apps/b", "holocron.config.json");
		pkg("apps/c");
	});
	afterEach(() => {
		vi.mocked(loadConfig).mockReset();
		rmSync(root, { recursive: true, force: true });
	});

	it("lists the packages that have a config, with the config each loads", async () => {
		const resolved = resolveConfig({ name: "app", providers: {} } as never);
		vi.mocked(loadConfig).mockResolvedValue({ filepath: "x", resolved });
		const found = await readWorkspaceConfigs(root);
		expect(found.map((c) => c.path)).toEqual(["apps/a", "apps/b"]);
		expect(found[0]).toEqual({ path: "apps/a", dir: join(root, "apps/a"), resolved });
	});

	it("keeps a package whose config cannot be loaded, with the reason", async () => {
		vi.mocked(loadConfig).mockRejectedValue(new Error("boom"));
		expect(await readWorkspaceConfigs(root)).toEqual([
			{ path: "apps/a", dir: join(root, "apps/a"), error: "boom" },
			{ path: "apps/b", dir: join(root, "apps/b"), error: "boom" },
		]);
	});

	it("is empty when the workspace's packages cannot be read", async () => {
		vi.mocked(readWorkspacePackages).mockImplementationOnce(() => {
			throw new Error("bad pnpm-workspace.yaml");
		});
		expect(await readWorkspaceConfigs(root)).toEqual([]);
		expect(vi.mocked(loadConfig)).not.toHaveBeenCalled();
	});
});
