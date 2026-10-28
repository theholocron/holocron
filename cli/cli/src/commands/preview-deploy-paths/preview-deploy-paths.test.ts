import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolvePreviewDeployPaths, withAutoPreviewDeployPaths } from "./preview-deploy-paths.js";

async function writePkg(dir: string, name: string, dependencies: Record<string, string> = {}): Promise<void> {
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", dependencies }));
}

describe("resolvePreviewDeployPaths", () => {
	let gitRoot: string;

	beforeEach(async () => {
		gitRoot = await mkdtemp(join(tmpdir(), "preview-deploy-paths-"));
	});
	afterEach(async () => {
		await rm(gitRoot, { recursive: true, force: true });
	});

	it("returns undefined when cwdValue is undefined", () => {
		expect(resolvePreviewDeployPaths(gitRoot, undefined)).toBeUndefined();
	});

	it('returns undefined for a root-level consumer (cwd: ".")', () => {
		expect(resolvePreviewDeployPaths(gitRoot, ".")).toBeUndefined();
	});

	it("returns the package's own dir plus its workspace:* dependencies", async () => {
		await writePkg(join(gitRoot, "packages", "shared"), "@demo/shared");
		await writePkg(join(gitRoot, "apps", "sentinel"), "@demo/sentinel", { "@demo/shared": "workspace:*" });

		expect(resolvePreviewDeployPaths(gitRoot, "apps/sentinel")).toEqual(["apps/sentinel/", "packages/shared/"]);
	});

	it("returns undefined when cwd doesn't match any known workspace package", async () => {
		await writePkg(join(gitRoot, "apps", "sentinel"), "@demo/sentinel");
		expect(resolvePreviewDeployPaths(gitRoot, "apps/nonexistent")).toBeUndefined();
	});
});

describe("withAutoPreviewDeployPaths", () => {
	let gitRoot: string;

	beforeEach(async () => {
		gitRoot = await mkdtemp(join(tmpdir(), "preview-deploy-paths-"));
	});
	afterEach(async () => {
		await rm(gitRoot, { recursive: true, force: true });
	});

	it("returns tasks unchanged when there's no delivery.previewDeploy entry", () => {
		const tasks = ["sourceQuality.staticAnalysis", { name: "delivery.build" }];
		expect(withAutoPreviewDeployPaths(tasks, gitRoot)).toEqual(tasks);
	});

	it("returns tasks unchanged when delivery.previewDeploy has no cwd (root-level)", () => {
		const tasks = [{ name: "delivery.previewDeploy", with: {} }];
		expect(withAutoPreviewDeployPaths(tasks, gitRoot)).toEqual(tasks);
	});

	it("returns tasks unchanged when with.paths is already explicitly set", () => {
		const tasks = [{ name: "delivery.previewDeploy", with: { cwd: "apps/sentinel", paths: ["custom/"] } }];
		expect(withAutoPreviewDeployPaths(tasks, gitRoot)).toEqual(tasks);
	});

	it("augments the delivery.previewDeploy entry with computed paths, without mutating the input", async () => {
		await writePkg(join(gitRoot, "packages", "shared"), "@demo/shared");
		await writePkg(join(gitRoot, "apps", "sentinel"), "@demo/sentinel", { "@demo/shared": "workspace:*" });
		const original = [
			"sourceQuality.staticAnalysis",
			{ name: "delivery.previewDeploy", with: { cwd: "apps/sentinel" } },
		];

		const result = withAutoPreviewDeployPaths(original, gitRoot);

		expect(result).toEqual([
			"sourceQuality.staticAnalysis",
			{
				name: "delivery.previewDeploy",
				with: { cwd: "apps/sentinel", paths: ["apps/sentinel/", "packages/shared/"] },
			},
		]);
		// The original array/entry are untouched.
		expect(original[1]).toEqual({ name: "delivery.previewDeploy", with: { cwd: "apps/sentinel" } });
	});

	it("leaves the entry unchanged when cwd doesn't resolve to a known package", async () => {
		const tasks = [{ name: "delivery.previewDeploy", with: { cwd: "apps/unknown" } }];
		expect(withAutoPreviewDeployPaths(tasks, gitRoot)).toEqual(tasks);
	});
});
