import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { discoverManifests } from "./discover-manifests.js";
import { workspaceFilterArgs } from "./workspace-filter-args.js";

/** A repo on disk: `files` maps repo-relative paths to JSON objects, or to text for non-JSON files. */
function makeRepo(files: Record<string, Record<string, unknown> | string>): string {
	const root = mkdtempSync(join(tmpdir(), "holocron-workspace-discovery-"));
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), typeof content === "string" ? content : JSON.stringify(content));
	}
	return root;
}

const workspace = (...globs: string[]) => `packages:\n${globs.map((glob) => `  - "${glob}"`).join("\n")}\n`;

describe("discoverManifests", () => {
	it("lists the packages of every workspace glob, including literal package folders", () => {
		const root = makeRepo({
			"pnpm-workspace.yaml": workspace("clients/*", "observability", "docs/theme"),
			"package.json": { name: "root", private: true },
			"clients/http-client/package.json": { name: "@acme/http-client" },
			"observability/package.json": { name: "@acme/observability" },
			"docs/theme/package.json": { name: "@acme/docs-theme" },
		});
		expect(discoverManifests(root).map(({ manifest, dir }) => [manifest.name, dir])).toEqual([
			["@acme/http-client", "./clients/http-client"],
			["@acme/observability", "./observability"],
			["@acme/docs-theme", "./docs/theme"],
		]);
	});

	it("reads the root manifest when there is no workspace file or no package directories", () => {
		const single = makeRepo({ "package.json": { name: "@acme/lib" } });
		expect(discoverManifests(single).map(({ manifest, dir }) => [manifest.name, dir])).toEqual([
			["@acme/lib", "."],
		]);
	});

	it("treats a root beside only a private docs site as a single package", () => {
		const root = makeRepo({
			"pnpm-workspace.yaml": workspace("docs"),
			"package.json": { name: "@acme/lib" },
			"docs/package.json": { name: "lib-site", private: true },
		});
		expect(discoverManifests(root).map(({ manifest, dir }) => [manifest.name, dir])).toEqual([["@acme/lib", "."]]);
	});
});

describe("workspaceFilterArgs", () => {
	it("filters by each workspace glob that holds a public package", () => {
		const root = makeRepo({
			"pnpm-workspace.yaml": workspace("clients/*", "observability", "utils/*", "docs"),
			"clients/http-client/package.json": { name: "@acme/http-client" },
			"observability/package.json": { name: "@acme/observability" },
			"docs/package.json": { name: "site", private: true },
		});
		expect(workspaceFilterArgs(root)).toEqual(["-r", "--filter=./clients/*", "--filter=./observability"]);
	});

	it("falls back to packages, apps and plugins without a workspace file", () => {
		const root = makeRepo({
			"packages/cli/package.json": { name: "@acme/cli" },
			"plugins/p/package.json": { name: "@acme/p" },
		});
		expect(workspaceFilterArgs(root)).toEqual(["-r", "--filter=./packages/*", "--filter=./plugins/*"]);
	});

	it("is empty for a single-package repo", () => {
		expect(workspaceFilterArgs(makeRepo({ "package.json": { name: "@acme/lib" } }))).toEqual([]);
	});
});
