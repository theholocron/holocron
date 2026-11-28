import { describe, expect, it } from "vitest";

import { TREE } from "../test-fixtures.js";
import { workspacePackages } from "./workspace-packages.js";

describe("workspacePackages", () => {
	const all = workspacePackages("/repo", TREE);

	it("lists the packages with a readable named package.json, skipping folders without one, sorted by folder", () => {
		expect(all.map((p) => p.name)).toEqual([
			"@theholocron/app",
			"@theholocron/astromech",
			"@theholocron/cli",
			"@theholocron/datapad",
		]);
	});

	it("skips a package.json with no name", () => {
		const tree = { readJson: () => ({ version: "1" }), listDirs: () => ["x"] };
		expect(workspacePackages("/repo", tree)).toEqual([]);
	});

	it("also discovers plugins/* packages, sibling to packages/* (holocron's own layout)", () => {
		const files: Record<string, unknown> = {
			"/repo/packages/cli/package.json": { name: "@theholocron/cli" },
			"/repo/plugins/holocron-plugin-github/package.json": { name: "@theholocron/holocron-plugin-github" },
		};
		const tree = {
			readJson: (path: string) => {
				if (!(path in files)) throw new Error(`ENOENT: ${path}`);
				return files[path];
			},
			listDirs: (dirPath: string) =>
				dirPath.endsWith("plugins") ? ["holocron-plugin-github"] : dirPath.endsWith("packages") ? ["cli"] : [],
		};
		expect(workspacePackages("/repo", tree).map((p) => p.name)).toEqual([
			"@theholocron/cli",
			"@theholocron/holocron-plugin-github",
		]);
	});

	it("also discovers apps/* packages, so a deployable app can declare an on-release deploy", () => {
		const files: Record<string, unknown> = {
			"/repo/packages/cli/package.json": { name: "@theholocron/cli" },
			"/repo/apps/sentinel/package.json": { name: "@theholocron/sentinel" },
		};
		const tree = {
			readJson: (path: string) => {
				if (!(path in files)) throw new Error(`ENOENT: ${path}`);
				return files[path];
			},
			listDirs: (dirPath: string) =>
				dirPath.endsWith("apps") ? ["sentinel"] : dirPath.endsWith("packages") ? ["cli"] : [],
		};
		expect(workspacePackages("/repo", tree).map((p) => p.name)).toEqual([
			"@theholocron/cli",
			"@theholocron/sentinel",
		]);
	});

	it("captures devDependencies too, not just dependencies (holocron#1071)", () => {
		const files: Record<string, unknown> = {
			"/repo/packages/cli/package.json": {
				name: "@theholocron/cli",
				devDependencies: { "@theholocron/tsconfig": "workspace:*" },
			},
		};
		const tree = {
			readJson: (path: string) => {
				if (!(path in files)) throw new Error(`ENOENT: ${path}`);
				return files[path];
			},
			listDirs: (dirPath: string) => (dirPath.endsWith("packages") ? ["cli"] : []),
		};
		const [cli] = workspacePackages("/repo", tree) as [ReturnType<typeof workspacePackages>[number]];
		expect(cli.devDependencies).toEqual({ "@theholocron/tsconfig": "workspace:*" });
	});

	it("defaults devDependencies to {} when the manifest has none", () => {
		expect(all[0]?.devDependencies).toEqual({});
	});

	it("treats a missing plugins/ directory as empty rather than throwing", () => {
		const tree = {
			readJson: (path: string) => {
				throw new Error(`should not be called: ${path}`);
			},
			listDirs: (dirPath: string) => {
				if (dirPath.endsWith("plugins")) throw new Error(`ENOENT: ${dirPath}`);
				return [];
			},
		};
		expect(workspacePackages("/repo", tree)).toEqual([]);
	});
});
