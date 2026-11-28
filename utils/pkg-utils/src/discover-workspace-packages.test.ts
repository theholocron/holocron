import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	discoverWorkspacePackages,
	type DiscoverWorkspacePackagesOptions,
	resolveWorkspaceGlobs,
	resolveWorkspacePatterns,
	type SkippedWorkspacePattern,
} from "./discover-workspace-packages.ts";

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

	it("skips a pattern it cannot interpret and reports it, instead of throwing", () => {
		const fs = repo({
			"/repo/pnpm-workspace.yaml": workspace("a/{b,c}", "../outside", "docs", "/abs", "x/[ab]", "y/a**b"),
			"/repo/docs/package.json": pkg("docs"),
		});
		const skipped: SkippedWorkspacePattern[] = [];
		const found = discoverWorkspacePackages("/repo", { ...fs, onSkippedPattern: (s) => skipped.push(s) });
		expect(found.map((p) => p.name)).toEqual(["docs"]);
		expect(skipped.map((s) => s.pattern)).toEqual(["a/{b,c}", "../outside", "/abs", "x/[ab]", "y/a**b"]);
		expect(skipped.every((s) => s.reason.length > 0)).toBe(true);
		// the channel is optional
		expect(() => discoverWorkspacePackages("/repo", fs)).not.toThrow();
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

describe("discoverWorkspacePackages on a real directory tree", () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "pkg-utils-ws-"));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const put = (rel: string, content: string) => {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), content);
	};
	const add = (...dirs: string[]) => dirs.forEach((dir) => put(`${dir}/package.json`, pkg(dir)));
	const dirsOf = (options: DiscoverWorkspacePackagesOptions = {}) =>
		discoverWorkspacePackages(root, options).map((p) => p.relativeDir);

	it("matches `*` one level deep only", () => {
		put("pnpm-workspace.yaml", workspace("apps/*"));
		add("apps/web", "apps/api", "apps/web/inner");
		expect(dirsOf()).toEqual(["apps/api", "apps/web"]);
	});

	it("matches `**` at any depth, the directory itself included, sorted", () => {
		put("pnpm-workspace.yaml", workspace("apps/**"));
		add("apps", "apps/web", "apps/web/inner", "apps/z/deep/er");
		expect(dirsOf()).toEqual(["apps", "apps/web", "apps/web/inner", "apps/z/deep/er"]);
	});

	it("matches a nested `**` between segments and `*` or `?` inside a segment", () => {
		put("pnpm-workspace.yaml", workspace("libs/**/pkg-*", "tools/?"));
		add("libs/a/pkg-one", "libs/a/b/pkg-two", "libs/a/other", "libs/pkg-zero", "tools/x", "tools/xy");
		expect(dirsOf()).toEqual(["libs/a/b/pkg-two", "libs/a/pkg-one", "libs/pkg-zero", "tools/x"]);
	});

	it("applies negation in order: it removes what came before and a later entry can add it back", () => {
		put("pnpm-workspace.yaml", workspace("apps/*", "'!apps/legacy'", "packages/**", "'!packages/**/internal'"));
		add("apps/web", "apps/legacy", "packages/a", "packages/a/internal", "packages/b");
		expect(dirsOf()).toEqual(["apps/web", "packages/a", "packages/b"]);

		put("pnpm-workspace.yaml", workspace("'!apps/legacy'", "apps/*"));
		expect(dirsOf()).toEqual(["apps/legacy", "apps/web"]);

		// a negation deeper than the package, or in another folder, removes nothing
		put("pnpm-workspace.yaml", workspace("apps/*", "'!apps/legacy/inner'", "'!libs/*'"));
		expect(dirsOf()).toEqual(["apps/legacy", "apps/web"]);
	});

	it("never enters node_modules or hidden directories through a wildcard", () => {
		put("pnpm-workspace.yaml", workspace("**"));
		add("a", "node_modules/dep", "a/node_modules/dep2", ".hidden/pkg", "a/.cache/pkg");
		expect(dirsOf()).toEqual(["a"]);
		put("pnpm-workspace.yaml", workspace("node_modules/dep", "*/dep2"));
		expect(dirsOf()).toEqual([]);
	});

	it("reads the `workspaces` array of the root package.json when there is no workspace file", () => {
		put("package.json", JSON.stringify({ name: "root", workspaces: ["./apps/**", "!apps/legacy", "tools/"] }));
		add("apps/web", "apps/legacy", "tools");
		expect(dirsOf()).toEqual(["apps/web", "tools"]);
	});

	it("reads the `{ packages }` form of `workspaces`, ignoring entries that are not strings", () => {
		put("package.json", JSON.stringify({ workspaces: { packages: ["libs/*", 3, ""] } }));
		add("libs/a");
		expect(dirsOf()).toEqual(["libs/a"]);
	});

	it("lets pnpm-workspace.yaml win when both files exist", () => {
		put("package.json", JSON.stringify({ workspaces: ["libs/*"] }));
		put("pnpm-workspace.yaml", workspace("apps/*"));
		add("libs/a", "apps/web");
		expect(dirsOf()).toEqual(["apps/web"]);
	});

	it("falls back to the default roots for a package.json without workspaces, a broken one, or none", () => {
		add("packages/a", "apps/b", "plugins/c", "libs/d");
		const defaults = ["packages/a", "apps/b", "plugins/c"];
		expect(dirsOf()).toEqual(defaults);
		put("package.json", JSON.stringify({ name: "root" }));
		expect(dirsOf()).toEqual(defaults);
		put("package.json", JSON.stringify({ workspaces: "libs/*" }));
		expect(dirsOf()).toEqual(defaults);
		put("package.json", "{ not json");
		expect(dirsOf()).toEqual(defaults);
		put("package.json", "null");
		expect(dirsOf()).toEqual(defaults);
	});

	it("reports an unsupported pattern, finds the rest, and treats a missing directory as no packages", () => {
		put("pnpm-workspace.yaml", workspace("apps/{web,api}", "gone/**", "libs/*"));
		add("libs/a");
		const skipped: string[] = [];
		expect(dirsOf({ onSkippedPattern: ({ pattern }) => skipped.push(pattern) })).toEqual(["libs/a"]);
		expect(skipped).toEqual(["apps/{web,api}"]);
	});

	it("does not hide a listing error other than a missing directory", () => {
		put("pnpm-workspace.yaml", workspace("apps/*"));
		const listDirs = () => {
			throw Object.assign(new Error("EACCES"), { code: "EACCES" });
		};
		expect(() => discoverWorkspacePackages(root, { listDirs })).toThrow(/EACCES/);
	});

	it("ignores empty and `.` segments in a pattern", () => {
		put("pnpm-workspace.yaml", workspace("apps//./web"));
		add("apps/web");
		expect(dirsOf()).toEqual(["apps/web"]);
	});

	it("ignores a dangling symlink among the directories", () => {
		put("pnpm-workspace.yaml", workspace("apps/*"));
		add("apps/web");
		symlinkSync(join(root, "nowhere"), join(root, "apps", "broken"));
		expect(dirsOf()).toEqual(["apps/web"]);
	});

	it("exposes the ordered patterns and the include and exclude split", () => {
		put("package.json", JSON.stringify({ workspaces: ["a/*", "!a/x"] }));
		expect(resolveWorkspacePatterns(root)).toEqual(["a/*", "!a/x"]);
		expect(resolveWorkspaceGlobs(root)).toEqual({ include: ["a/*"], exclude: ["a/x"] });
	});

	it("stops following `**` past a depth limit", () => {
		put("pnpm-workspace.yaml", workspace("**"));
		add(Array.from({ length: 40 }, () => "d").join("/"), "d/d/d");
		expect(dirsOf()).toEqual(["d/d/d"]);
	});
});
