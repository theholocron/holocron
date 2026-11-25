import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readWorkspacePackages } from "@theholocron/astromech";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedHolocronConfig } from "../../config/index.js";
import { readWorkspaceConfigs } from "../workspace-configs/index.js";
import { resolveApp } from "./resolve-app.js";

vi.mock("../workspace-configs/index.js", () => ({ readWorkspaceConfigs: vi.fn() }));
vi.mock("@theholocron/astromech", async (importOriginal) => {
	const original = await importOriginal<typeof import("@theholocron/astromech")>();
	return { ...original, readWorkspacePackages: vi.fn(original.readWorkspacePackages) };
});

describe("resolveApp", () => {
	let root: string;
	const resolved = { providers: {} } as unknown as ResolvedHolocronConfig;

	function pkg(dir: string) {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name: `@x/${dir.replaceAll("/", "-")}` }));
	}

	beforeEach(() => {
		root = realpathSync(mkdtempSync(join(tmpdir(), "resolve-app-")));
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - cli/*\n");
		pkg("apps/sentinel");
		pkg("apps/council");
		pkg("cli/cli");
		vi.mocked(readWorkspaceConfigs).mockResolvedValue([
			{ path: "apps/sentinel", dir: join(root, "apps/sentinel"), resolved },
		]);
	});
	afterEach(() => {
		vi.mocked(readWorkspaceConfigs).mockReset();
		rmSync(root, { recursive: true, force: true });
	});

	it("finds an app by name from the repository root, with its config", async () => {
		const found = await resolveApp("sentinel", root);
		expect(found.repoRoot).toBe(root);
		expect(found.app).toEqual({
			name: "sentinel",
			path: "apps/sentinel",
			dir: join(root, "apps/sentinel"),
			config: resolved,
		});
		expect(found.names).toEqual(["council", "sentinel"]);
	});

	it("finds an app that has no config of its own, with no config", async () => {
		const found = await resolveApp("council", root);
		expect(found.app).toEqual({ name: "council", path: "apps/council", dir: join(root, "apps/council") });
	});

	it("finds the app the working folder is inside, and its subfolders, when no name is given", async () => {
		mkdirSync(join(root, "apps/sentinel/src"), { recursive: true });
		expect((await resolveApp(undefined, join(root, "apps/sentinel"))).app?.name).toBe("sentinel");
		expect((await resolveApp(undefined, join(root, "apps/sentinel/src"))).app?.name).toBe("sentinel");
	});

	it("finds no app from the root with no name, nor for a package outside apps/", async () => {
		expect((await resolveApp(undefined, root)).app).toBeUndefined();
		expect((await resolveApp("cli", root)).app).toBeUndefined();
	});

	it("does not match a folder whose name only starts like an app's", async () => {
		pkg("apps/sentinel-extra");
		expect((await resolveApp(undefined, join(root, "apps/sentinel-extra"))).app?.name).toBe("sentinel-extra");
	});

	it("carries the reason an app's config could not be read", async () => {
		vi.mocked(readWorkspaceConfigs).mockResolvedValue([
			{ path: "apps/sentinel", dir: join(root, "apps/sentinel"), error: "boom" },
		]);
		const found = await resolveApp("sentinel", root);
		expect(found.app?.configError).toBe("boom");
		expect(found.app?.config).toBeUndefined();
	});

	it("lists no apps where the workspace cannot be read", async () => {
		vi.mocked(readWorkspacePackages).mockImplementationOnce(() => {
			throw new Error("bad pnpm-workspace.yaml");
		});
		const found = await resolveApp("sentinel", root);
		expect(found.names).toEqual([]);
		expect(found.app).toBeUndefined();
	});

	it("leaves out a package nested deeper than apps/<name>", async () => {
		pkg("apps/sentinel/inner");
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - apps/*/*\n  - cli/*\n");
		expect((await resolveApp(undefined, root)).names).toEqual(["council", "sentinel"]);
	});
});
