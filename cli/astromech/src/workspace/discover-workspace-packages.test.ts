import { describe, expect, it } from "vitest";

import { discoverWorkspacePackages } from "./discover-workspace-packages.js";

/** An in-memory repo: `files` maps absolute paths to text; directories are inferred from them. */
function repo(files: Record<string, string>) {
	const dirs = (dir: string): string[] => [
		...new Set(
			Object.keys(files)
				.filter((path) => path.startsWith(`${dir}/`))
				.map((path) => path.slice(dir.length + 1).split("/")[0]!)
				.filter((name) => !name.includes("."))
		),
	];
	return {
		readFile: (path: string) => {
			if (!(path in files)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
			return files[path]!;
		},
		readText: (path: string) => {
			if (!(path in files)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
			return files[path]!;
		},
		listDirs: (dir: string) => {
			const names = dirs(dir);
			if (names.length === 0) throw Object.assign(new Error(`ENOENT: ${dir}`), { code: "ENOENT" });
			return names;
		},
	};
}

const pkg = (name: string) => JSON.stringify({ name });
const workspace = (...lines: string[]) => `packages:\n${lines.map((line) => `  - ${line}`).join("\n")}\n`;

describe("discoverWorkspacePackages", () => {
	it("expands `<dir>/*` globs and takes literal directories as the package itself", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("clients/*", "observability", "docs/theme"),
			"/repo/clients/http-client/package.json": pkg("@theholocron/http-client"),
			"/repo/clients/github-client/package.json": pkg("@theholocron/github-client"),
			"/repo/observability/package.json": pkg("@theholocron/observability"),
			"/repo/docs/theme/package.json": pkg("@theholocron/docs-theme"),
		});
		const found = discoverWorkspacePackages("/repo", fs);
		expect(found.map((p) => [p.name, p.relativeDir, p.dir])).toEqual([
			["@theholocron/github-client", "clients/github-client", "/repo/clients/github-client"],
			["@theholocron/http-client", "clients/http-client", "/repo/clients/http-client"],
			["@theholocron/observability", "observability", "/repo/observability"],
			["@theholocron/docs-theme", "docs/theme", "/repo/docs/theme"],
		]);
	});

	it("limits discovery to one version group: a folder of packages, or a package that is its own folder", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("clients/*", "clients-old/*", "observability", "docs/theme"),
			"/repo/clients/http/package.json": pkg("http"),
			"/repo/clients/github/package.json": pkg("github"),
			"/repo/clients-old/x/package.json": pkg("old"),
			"/repo/observability/package.json": pkg("observability"),
			"/repo/docs/theme/package.json": pkg("theme"),
		});
		const names = (group: string) => discoverWorkspacePackages("/repo", { ...fs, group }).map((p) => p.name);
		expect(names("clients")).toEqual(["github", "http"]);
		expect(names("observability")).toEqual(["observability"]);
		expect(names("docs")).toEqual(["theme"]);
		expect(names("./clients/")).toEqual(["github", "http"]);
		expect(names("nothing")).toEqual([]);
	});

	it("leaves out the packages of excluded groups, alone or with a group", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("clients/*", "observability", "utils/*"),
			"/repo/clients/http/package.json": pkg("http"),
			"/repo/observability/package.json": pkg("observability"),
			"/repo/utils/array/package.json": pkg("array"),
		});
		const names = (options: object) => discoverWorkspacePackages("/repo", { ...fs, ...options }).map((p) => p.name);
		expect(names({ excludeGroups: ["observability"] })).toEqual(["http", "array"]);
		expect(names({ excludeGroups: ["clients", "utils"] })).toEqual(["observability"]);
		expect(names({ excludeGroups: ["nothing"] })).toEqual(["http", "observability", "array"]);
		expect(names({ group: "utils", excludeGroups: ["utils"] })).toEqual([]);
	});

	it("returns groups in glob order", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("utils/*", "apps/*"),
			"/repo/apps/web/package.json": pkg("web"),
			"/repo/utils/array/package.json": pkg("array"),
		});
		expect(discoverWorkspacePackages("/repo", fs).map((p) => p.name)).toEqual(["array", "web"]);
	});

	it("drops packages matched by a `!` exclusion, exact or `<dir>/*`", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("clients/*", "skills", "'!clients/old'", "'!skills'"),
			"/repo/clients/old/package.json": pkg("old"),
			"/repo/clients/new/package.json": pkg("new"),
			"/repo/skills/package.json": pkg("skills"),
		});
		expect(discoverWorkspacePackages("/repo", fs).map((p) => p.name)).toEqual(["new"]);
	});

	it("drops a whole `<dir>/*` group with a `!<dir>/*` exclusion, but not packages deeper than one level", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("clients/*", "clients/legacy/tool", "'!clients/*'"),
			"/repo/clients/http-client/package.json": pkg("http-client"),
			"/repo/clients/legacy/tool/package.json": pkg("tool"),
		});
		expect(discoverWorkspacePackages("/repo", fs).map((p) => p.name)).toEqual(["tool"]);
	});

	it("skips the repo root `.`, a literal directory without a manifest, and a missing group", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("'.'", "missing", "ghost/*", "docs"),
			"/repo/docs/readme.md": "x",
		});
		expect(discoverWorkspacePackages("/repo", fs)).toEqual([]);
	});

	it("skips a literal folder whose package.json is not a JSON object", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("observability", "skills"),
			"/repo/observability/package.json": "[]",
			"/repo/skills/package.json": "not json",
		});
		expect(discoverWorkspacePackages("/repo", fs)).toEqual([]);
	});

	it("does not return the same package twice when globs overlap", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("clients/*", "clients/http-client"),
			"/repo/clients/http-client/package.json": pkg("http-client"),
		});
		expect(discoverWorkspacePackages("/repo", fs)).toHaveLength(1);
	});

	it("falls back to packages, apps and plugins when there is no workspace file or it lists none", () => {
		const files = {
			"/repo/packages/cli/package.json": pkg("cli"),
			"/repo/plugins/p/package.json": pkg("p"),
			"/repo/apps/web/package.json": pkg("web"),
			"/repo/clients/x/package.json": pkg("x"),
		};
		const expected = ["cli", "web", "p"];
		expect(discoverWorkspacePackages("/repo", repo(files)).map((p) => p.name)).toEqual(expected);
		expect(
			discoverWorkspacePackages(
				"/repo",
				repo({ ...files, "/repo/pnpm-workspace.yaml": "catalog:\n  a: ^1\n" })
			).map((p) => p.name)
		).toEqual(expected);
	});

	it("throws on a glob it cannot expand, rather than skipping its packages", () => {
		const fs = repo({ "/repo/pnpm-workspace.yaml": workspace("packages/**") });
		expect(() => discoverWorkspacePackages("/repo", fs)).toThrow(/unsupported workspace pattern "packages\/\*\*"/);
		expect(() =>
			discoverWorkspacePackages("/repo", repo({ "/repo/pnpm-workspace.yaml": workspace("a/*/b") }))
		).toThrow(TypeError);
	});

	it("throws on a directory that climbs out of the repo", () => {
		const fs = repo({ "/repo/pnpm-workspace.yaml": workspace("../outside") });
		expect(() => discoverWorkspacePackages("/repo", fs)).toThrow(/inside the repo/);
	});

	it("keeps a package.json that has no name, for the caller to filter", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("tools/*"),
			"/repo/tools/x/package.json": JSON.stringify({ private: true }),
		});
		expect(discoverWorkspacePackages("/repo", fs).map((p) => [p.name, p.manifest.private])).toEqual([
			[undefined, true],
		]);
	});
});
