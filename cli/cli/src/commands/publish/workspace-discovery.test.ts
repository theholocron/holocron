import { describe, expect, it } from "vitest";

import { makeTempWorkspace as makeRepo } from "../../testing/publish-fixtures.js";
import { discoverManifests } from "./discover-manifests.js";
import { discoverPublicPackageEntries } from "./discover-public-package-entries.js";
import { discoverPublicPackages } from "./discover-public-packages.js";
import { workspaceFilterArgs } from "./workspace-filter-args.js";

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

describe("version groups", () => {
	const root = () =>
		makeRepo({
			"pnpm-workspace.yaml": workspace("clients/*", "observability", "utils/*"),
			"package.json": { name: "@acme/root", version: "1.0.0" },
			"clients/http/package.json": { name: "@acme/http", version: "1.5.0" },
			"clients/github/package.json": { name: "@acme/github", version: "1.5.0" },
			"clients/internal/package.json": { name: "@acme/internal", version: "1.5.0", private: true },
			"observability/package.json": { name: "@acme/observability", version: "0.6.0" },
			"utils/array/package.json": { name: "@acme/array", version: "1.16.0" },
		});

	it("discoverManifests lists only the group's packages", () => {
		expect(discoverManifests(root(), { group: "clients" }).map(({ dir }) => dir)).toEqual([
			"./clients/github",
			"./clients/http",
			"./clients/internal",
		]);
		expect(discoverManifests(root(), { group: "observability" }).map(({ dir }) => dir)).toEqual([
			"./observability",
		]);
	});

	it("a group with no packages publishes nothing, never the root package", () => {
		expect(discoverManifests(root(), { group: "skills" })).toEqual([]);
	});

	it("keeps public packages only, with versions", () => {
		expect(discoverPublicPackageEntries(root(), { group: "clients" })).toEqual([
			{ name: "@acme/github", version: "1.5.0", dir: "./clients/github" },
			{ name: "@acme/http", version: "1.5.0", dir: "./clients/http" },
		]);
		expect(discoverPublicPackages(root(), { group: "utils" })).toEqual(["@acme/array"]);
	});

	it("filters by the globs that hold the group's public packages", () => {
		expect(workspaceFilterArgs(root(), { group: "clients" })).toEqual(["-r", "--filter=./clients/*"]);
		expect(workspaceFilterArgs(root(), { group: "observability" })).toEqual(["-r", "--filter=./observability"]);
		expect(workspaceFilterArgs(root(), { group: "skills" })).toEqual([]);
	});

	describe("excluding groups", () => {
		it("leaves a group's packages out of the repo-wide set", () => {
			expect(
				discoverManifests(root(), { excludeGroups: ["clients", "observability"] }).map(({ dir }) => dir)
			).toEqual(["./utils/array"]);
		});

		it("leaves excluded groups out of the public entries and names", () => {
			expect(discoverPublicPackageEntries(root(), { excludeGroups: ["clients"] }).map((e) => e.name)).toEqual([
				"@acme/observability",
				"@acme/array",
			]);
			expect(discoverPublicPackages(root(), { excludeGroups: ["clients", "utils"] })).toEqual([
				"@acme/observability",
			]);
		});

		it("filters by the globs that still hold a package", () => {
			expect(workspaceFilterArgs(root(), { excludeGroups: ["observability"] })).toEqual([
				"-r",
				"--filter=./clients/*",
				"--filter=./utils/*",
			]);
			expect(workspaceFilterArgs(root(), { excludeGroups: ["clients", "observability", "utils"] })).toEqual([]);
		});

		it("falls back to the root package when excluding leaves nothing public, as for a repo with none", () => {
			expect(
				discoverManifests(root(), { excludeGroups: ["clients", "observability", "utils"] }).map(
					({ dir }) => dir
				)
			).toEqual(["."]);
		});

		it("combines with a group: only that group, less what is excluded", () => {
			expect(discoverManifests(root(), { group: "clients", excludeGroups: ["clients"] })).toEqual([]);
			expect(
				discoverManifests(root(), { group: "utils", excludeGroups: ["clients"] }).map(({ dir }) => dir)
			).toEqual(["./utils/array"]);
		});
	});
});
