import { describe, expect, it } from "vitest";

import { groupReleaseConfig } from "./group-release-config.js";

type Entry = string | [unknown, Record<string, unknown>?];
type Config = { tagFormat: string; branches: unknown; plugins: Entry[] };

const build = (options: Parameters<typeof groupReleaseConfig>[0]) => groupReleaseConfig(options) as Config;
const find = (config: Config, name: string) =>
	config.plugins.find((entry) => (Array.isArray(entry) ? entry[0] : entry) === name);

describe("groupReleaseConfig", () => {
	it("prefixes the tags with the group", () => {
		expect(build({ group: "clients" }).tagFormat).toBe("clients-v${version}");
	});

	it("keeps the branches and the exec commands it is given", () => {
		const exec = { prepareCmd: "bump", publishCmd: "publish" };
		const config = build({ group: "cli", branches: ["main", { name: "alpha", prerelease: true }], exec });
		expect(config.branches).toEqual(["main", { name: "alpha", prerelease: true }]);
		expect(find(config, "@semantic-release/exec")).toEqual(["@semantic-release/exec", exec]);
	});

	it("keeps the stock plugin order, replacing the analyzer and notes generator with folder-scoped ones", () => {
		const { plugins } = build({ group: "clients" });
		const names = plugins.map((entry) => (Array.isArray(entry) ? entry[0] : entry));
		expect(typeof names[0]).toBe("object");
		expect(names[0]).toHaveProperty("analyzeCommits");
		expect(names[1]).toHaveProperty("generateNotes");
		expect(names.slice(2)).toEqual([
			"@semantic-release/changelog",
			"@semantic-release/git",
			"@semantic-release/github",
		]);
	});

	it("keeps the org's analyzer and notes configuration for the scoped plugins", () => {
		const { plugins } = build({ group: "clients" });
		expect((plugins[0] as [unknown, Record<string, unknown>])[1]).toMatchObject({ preset: "conventionalcommits" });
		expect((plugins[1] as [unknown, Record<string, unknown>])[1]).toMatchObject({ preset: "conventionalcommits" });
	});

	it("writes the group's own changelog", () => {
		expect(find(build({ group: "clients" }), "@semantic-release/changelog")).toEqual([
			"@semantic-release/changelog",
			{ changelogFile: "clients/CHANGELOG.md" },
		]);
		expect(
			find(build({ group: "clients", changelogFile: "docs/clients.md" }), "@semantic-release/changelog")
		).toEqual(["@semantic-release/changelog", { changelogFile: "docs/clients.md" }]);
	});

	it("commits only the group's files, with the group in the message", () => {
		const [, git] = find(build({ group: "clients" }), "@semantic-release/git") as [string, Record<string, unknown>];
		expect(git["assets"]).toEqual(["clients/CHANGELOG.md", "clients/**/package.json", "!**/node_modules/**"]);
		expect(git["message"]).toMatch(/^chore\(release\): clients \$\{nextRelease\.version\} \[skip ci\]/);
	});

	it("lets the caller choose the release commit's assets", () => {
		const [, git] = find(build({ group: "skills", assets: ["skills/package.json"] }), "@semantic-release/git") as [
			string,
			Record<string, unknown>,
		];
		expect(git["assets"]).toEqual(["skills/package.json"]);
	});

	it("includes the npm plugin when asked, like defineConfig", () => {
		expect(find(build({ group: "observability", npm: true }), "@semantic-release/npm")).toBeDefined();
		expect(find(build({ group: "observability" }), "@semantic-release/npm")).toBeUndefined();
	});

	it("rejects a group that cannot be a tag prefix", () => {
		for (const group of ["", "Clients", "a/b", "clients v", "1clients", "${x}"]) {
			expect(() => groupReleaseConfig({ group })).toThrow(TypeError);
		}
	});

	it("rejects an empty path list", () => {
		expect(() => groupReleaseConfig({ group: "clients", paths: [] })).toThrow(/at least one path/);
	});
});
