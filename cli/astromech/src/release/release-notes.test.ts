import { releaseNotesGenerator } from "@theholocron/semantic-release-config";
import { describe, expect, it } from "vitest";

import { folderScoped, ungroupedScoped } from "./folder-scoped/index.js";

/**
 * The org's notes configuration run through the real `@semantic-release/release-notes-generator`.
 *
 * The generator loads the `conventionalcommits` preset from the repo, and its bundled
 * `conventional-changelog-writer` only understands the preset's pre-10 template format: with
 * preset 10.x the writer renders the version heading and silently drops every commit, so a
 * release's notes (and its CHANGELOG entry) are empty. A dependency bump that breaks the pairing
 * fails here instead of shipping empty notes (holocron#1245).
 */
const commit = (hash: string, message: string) => ({ hash, message, committerDate: new Date().toISOString() });

const COMMITS = [
	commit("a".repeat(40), "fix(clients): only clients changed"),
	commit("b".repeat(40), "feat(clients): add a client"),
	commit("c".repeat(40), "feat(utils): a different group"),
	commit("d".repeat(40), "perf(clients): faster requests"),
];

const FILES = new Map([
	["a".repeat(40), ["clients/a.ts"]],
	["b".repeat(40), ["clients/b.ts"]],
	["c".repeat(40), ["utils/c.ts"]],
	["d".repeat(40), ["clients/d.ts"]],
]);

async function notes(paths: string[]) {
	const plugin = folderScoped("generateNotes", paths, { listFiles: () => FILES });
	const [, config] = releaseNotesGenerator as [string, Record<string, unknown>];
	return (await plugin.generateNotes!(config, {
		cwd: process.cwd(),
		env: {},
		logger: { log() {} },
		options: { repositoryUrl: "https://github.com/acme/repo.git" },
		lastRelease: { gitTag: "clients-v1.0.0", gitHead: "0".repeat(40) },
		nextRelease: { version: "1.1.0", gitTag: "clients-v1.1.0", gitHead: "9".repeat(40) },
		commits: COMMITS,
	})) as string;
}

describe("release notes", () => {
	it("list the commits, under the org's section headings", async () => {
		const body = await notes(["clients"]);
		expect(body).toContain("### Features");
		expect(body).toContain("add a client");
		expect(body).toContain("### Bug Fixes");
		expect(body).toContain("only clients changed");
		expect(body).toContain("### Performance");
		expect(body).toContain("faster requests");
	});

	it("link to the group's prefixed tags", async () => {
		expect(await notes(["clients"])).toContain("/compare/clients-v1.0.0...clients-v1.1.0");
	});

	it("leave out commits that did not touch the group", async () => {
		expect(await notes(["clients"])).not.toContain("a different group");
	});
});

describe("release notes of everything in no group", () => {
	it("list the commits outside the groups and leave out the groups' own, imported ones included", async () => {
		const plugin = ungroupedScoped("generateNotes", ["utils"], { listFiles: () => FILES });
		const [, config] = releaseNotesGenerator as [string, Record<string, unknown>];
		const body = (await plugin.generateNotes!(config, {
			cwd: process.cwd(),
			env: {},
			logger: { log() {} },
			options: { repositoryUrl: "https://github.com/acme/repo.git" },
			lastRelease: { gitTag: "v1.0.0", gitHead: "0".repeat(40) },
			nextRelease: { version: "1.1.0", gitTag: "v1.1.0", gitHead: "9".repeat(40) },
			commits: COMMITS,
		})) as string;

		expect(body).toContain("add a client");
		expect(body).toContain("only clients changed");
		expect(body).not.toContain("a different group");
		expect(body).toContain("/compare/v1.0.0...v1.1.0");
	});
});
