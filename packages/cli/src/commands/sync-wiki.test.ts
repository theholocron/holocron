import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveConfig } from "../config/config.js";
import type { LoadedConfig } from "../config/load-config.js";
import { buildNavbarLinks, discoverWikiRepos, mergeWikiConfig, runSyncWiki, validateWikiConfig } from "./sync-wiki.js";

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return {
		resolved: resolveConfig(rawConfig),
		filepath: "/tmp/test/holocron.config.json",
	};
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

interface RepoStub {
	name: string;
	full_name: string;
	archived?: boolean;
	configJson?: unknown;
	configTs?: string;
}

function makeOrgFetch(repos: RepoStub[]) {
	return async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
		const urlStr = url.toString();

		if (urlStr.includes("/orgs/") && urlStr.includes("/repos")) {
			const page = new URL(urlStr).searchParams.get("page") ?? "1";
			if (page === "1") {
				const body = repos.map((r) => ({
					name: r.name,
					full_name: r.full_name,
					archived: r.archived ?? false,
				}));
				return new Response(JSON.stringify(body), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}

		for (const repo of repos) {
			if (urlStr.includes(`/repos/${repo.full_name}/contents/holocron.config.json`)) {
				if (!repo.configJson) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
				const content = Buffer.from(JSON.stringify(repo.configJson)).toString("base64");
				return new Response(JSON.stringify({ content: content + "\n", encoding: "base64" }), { status: 200 });
			}
			if (urlStr.includes(`/repos/${repo.full_name}/contents/holocron.config.ts`)) {
				if (!repo.configTs) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
				const content = Buffer.from(repo.configTs).toString("base64");
				return new Response(JSON.stringify({ content: content + "\n", encoding: "base64" }), { status: 200 });
			}
		}

		return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
	};
}

// ---------------------------------------------------------------------------
// discoverWikiRepos
// ---------------------------------------------------------------------------

describe("discoverWikiRepos", () => {
	it("returns empty array when no repos have wiki configured", async () => {
		const fetch = makeOrgFetch([
			{ name: "no-wiki", full_name: "org/no-wiki", configJson: { providers: { source: "github" } } },
		]);

		const repos = await discoverWikiRepos("org", "token", fetch as typeof globalThis.fetch);
		expect(repos).toEqual([]);
	});

	it("discovers wiki from JSON config with explicit domain path", async () => {
		const fetch = makeOrgFetch([
			{
				name: "myrepo",
				full_name: "org/myrepo",
				configJson: { providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo" }] } },
			},
		]);

		const repos = await discoverWikiRepos("org", "token", fetch as typeof globalThis.fetch);
		expect(repos).toHaveLength(1);
		expect(repos[0]).toMatchObject({ basepath: "myrepo", domain: "wiki.example.com/myrepo" });
	});

	it("derives basepath from repo name when domain has no path segment", async () => {
		const fetch = makeOrgFetch([
			{
				name: "myrepo",
				full_name: "org/myrepo",
				configJson: { providers: { wiki: ["fern", { domain: "wiki.example.com" }] } },
			},
		]);

		const repos = await discoverWikiRepos("org", "token", fetch as typeof globalThis.fetch);
		expect(repos[0]?.basepath).toBe("myrepo");
	});

	it("discovers wiki from TS config", async () => {
		const fetch = makeOrgFetch([
			{
				name: "skills",
				full_name: "org/skills",
				configTs: `export default { providers: { wiki: ["fern", { domain: "wiki.example.com/skills" }] } };`,
			},
		]);

		const repos = await discoverWikiRepos("org", "token", fetch as typeof globalThis.fetch);
		expect(repos[0]?.basepath).toBe("skills");
	});

	it("skips archived repos", async () => {
		const fetch = makeOrgFetch([
			{
				name: "archived",
				full_name: "org/archived",
				archived: true,
				configJson: { providers: { wiki: ["fern", { domain: "wiki.example.com/archived" }] } },
			},
		]);

		const repos = await discoverWikiRepos("org", "token", fetch as typeof globalThis.fetch);
		expect(repos).toHaveLength(0);
	});

	it("sorts repos alphabetically by basepath", async () => {
		const fetch = makeOrgFetch([
			{
				name: "zeta",
				full_name: "org/zeta",
				configJson: { providers: { wiki: ["fern", { domain: "wiki.example.com/zeta" }] } },
			},
			{
				name: "alpha",
				full_name: "org/alpha",
				configJson: { providers: { wiki: ["fern", { domain: "wiki.example.com/alpha" }] } },
			},
		]);

		const repos = await discoverWikiRepos("org", "token", fetch as typeof globalThis.fetch);
		expect(repos.map((r) => r.basepath)).toEqual(["alpha", "zeta"]);
	});

	it("generates human-readable display names from basepaths", async () => {
		const fetch = makeOrgFetch([
			{
				name: "cli-template",
				full_name: "org/cli-template",
				configJson: { providers: { wiki: ["fern", { domain: "wiki.example.com/cli-template" }] } },
			},
		]);

		const repos = await discoverWikiRepos("org", "token", fetch as typeof globalThis.fetch);
		expect(repos[0]?.displayName).toBe("Cli Template");
	});

	it("skips repo when config JSON is invalid", async () => {
		const fetch = makeOrgFetch([{ name: "bad", full_name: "org/bad" }]);
		const wrappedFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
			if (url.toString().includes("/contents/holocron.config.json")) {
				const content = Buffer.from("not valid json {{{").toString("base64");
				return new Response(JSON.stringify({ content, encoding: "base64" }), { status: 200 });
			}
			return (fetch as typeof globalThis.fetch)(url, init);
		};

		const repos = await discoverWikiRepos("org", "token", wrappedFetch as typeof globalThis.fetch);
		expect(repos).toHaveLength(0);
	});

	it("paginates when first page returns exactly 100 repos", async () => {
		const page1 = Array.from({ length: 100 }, (_, i) => ({
			name: `repo-${i}`,
			full_name: `org/repo-${i}`,
			archived: false,
		}));
		const wikiRepo = { name: "wiki-repo", full_name: "org/wiki-repo", archived: false };

		const paginatedFetch = async (url: string | URL | Request): Promise<Response> => {
			const urlStr = url.toString();
			if (urlStr.includes("/orgs/") && urlStr.includes("/repos")) {
				const page = new URL(urlStr).searchParams.get("page") ?? "1";
				if (page === "1") return new Response(JSON.stringify(page1), { status: 200 });
				if (page === "2") return new Response(JSON.stringify([wikiRepo]), { status: 200 });
				return new Response(JSON.stringify([]), { status: 200 });
			}
			if (urlStr.includes("/repos/org/wiki-repo/contents/holocron.config.json")) {
				const content = Buffer.from(
					JSON.stringify({ providers: { wiki: ["fern", { domain: "wiki.example.com/wiki-repo" }] } })
				).toString("base64");
				return new Response(JSON.stringify({ content, encoding: "base64" }), { status: 200 });
			}
			return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
		};

		const repos = await discoverWikiRepos("org", "token", paginatedFetch as typeof globalThis.fetch);
		expect(repos).toHaveLength(1);
		expect(repos[0]?.basepath).toBe("wiki-repo");
	});
});

// ---------------------------------------------------------------------------
// buildNavbarLinks
// ---------------------------------------------------------------------------

describe("buildNavbarLinks", () => {
	const repos = [
		{ displayName: "Configs", basepath: "configs", domain: "wiki.example.com/configs" },
		{ displayName: "Holocron", basepath: "holocron", domain: "wiki.example.com/holocron" },
		{ displayName: "Skills", basepath: "skills", domain: "wiki.example.com/skills" },
	];

	it("includes a github type link to the current repo first", () => {
		const block = buildNavbarLinks(repos, "skills", "org/skills");
		const lines = block.split("\n");
		expect(lines[0]).toBe("navbar-links:");
		expect(lines[1]).toBe("  - type: github");
		expect(lines[2]).toBe("    value: https://github.com/org/skills");
	});

	it("excludes the current repo from minimal links", () => {
		const block = buildNavbarLinks(repos, "skills", "org/skills");
		expect(block).not.toContain("wiki.example.com/skills");
		expect(block).toContain("wiki.example.com/configs");
		expect(block).toContain("wiki.example.com/holocron");
	});

	it("includes minimal links for all other repos", () => {
		const block = buildNavbarLinks(repos, "holocron", "org/holocron");
		expect(block).toContain("  - type: minimal");
		expect(block).toContain("    value: https://wiki.example.com/configs");
		expect(block).toContain("    label: Configs");
		expect(block).toContain("    value: https://wiki.example.com/skills");
		expect(block).toContain("    label: Skills");
	});

	it("falls back to wiki.theholocron.dev when domain is absent", () => {
		const reposNoDomain = [{ displayName: "Skills", basepath: "skills" }];
		const block = buildNavbarLinks(reposNoDomain, "other", "org/other");
		expect(block).toContain("https://wiki.theholocron.dev/skills");
	});

	it("produces only github link when no other wikis exist", () => {
		const block = buildNavbarLinks(repos.slice(0, 1), "configs", "org/configs");
		const lines = block.split("\n");
		// Only 3 lines: navbar-links:, - type: github, value:
		expect(lines).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// mergeWikiConfig
// ---------------------------------------------------------------------------

describe("mergeWikiConfig", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-wiki-merge-test-"));
		await mkdir(join(tmpDir, "fern"), { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	const cfg = {
		owner: "theholocron",
		repoName: "skills",
		navbarBlock: [
			"navbar-links:",
			"  - type: github",
			"    value: https://github.com/theholocron/skills",
			"  - type: minimal",
			"    value: https://wiki.theholocron.dev/holocron",
			"    label: Holocron",
		].join("\n"),
	};

	const docsPath = () => join(tmpDir, "fern", "docs.yml");

	function write(content: string) {
		return writeFile(docsPath(), content, "utf8");
	}

	it("adds edit-this-page and navbar-links to a minimal file", async () => {
		await write(
			[
				`instances:`,
				`  - url: holocron.docs.buildwithfern.com/skills`,
				`    multi-source: true`,
				``,
				`title: skills Engineering`,
				``,
				`colors:`,
				`  accent-primary:`,
				`    dark: "#70E155"`,
			].join("\n")
		);

		const changed = await mergeWikiConfig(docsPath(), cfg);

		expect(changed).toBe(true);
		const result = await readFile(docsPath(), "utf8");
		expect(result).toContain("edit-this-page:");
		expect(result).toContain("navbar-links:");
		expect(result).toContain("type: github");
		expect(result).toContain("type: minimal");
		expect(result).toContain("label: Holocron");
	});

	it("replaces an existing navbar-links block wholesale", async () => {
		await write(
			[
				`instances:`,
				`  - url: holocron.docs.buildwithfern.com/skills`,
				`    multi-source: true`,
				`    edit-this-page:`,
				`      github:`,
				`        owner: theholocron`,
				`        repo: skills`,
				`        branch: main`,
				``,
				`title: skills Engineering`,
				``,
				`navbar-links:`,
				`  - type: github`,
				`    value: https://github.com/theholocron/skills`,
				`  - type: minimal`,
				`    value: https://wiki.theholocron.dev/stale-repo`,
				`    label: Stale Repo`,
				``,
				`colors:`,
				`  accent-primary:`,
				`    dark: "#70E155"`,
			].join("\n")
		);

		await mergeWikiConfig(docsPath(), cfg);

		const result = await readFile(docsPath(), "utf8");
		expect(result).not.toContain("stale-repo");
		expect(result).toContain("label: Holocron");
	});

	it("is idempotent when content already matches", async () => {
		await write(
			[
				`instances:`,
				`  - url: holocron.docs.buildwithfern.com/skills`,
				`    multi-source: true`,
				`    edit-this-page:`,
				`      github:`,
				`        owner: theholocron`,
				`        repo: skills`,
				`        branch: main`,
				``,
				`title: skills Engineering`,
				``,
				cfg.navbarBlock,
				``,
				`colors:`,
				`  accent-primary:`,
				`    dark: "#70E155"`,
			].join("\n")
		);

		const before = await readFile(docsPath(), "utf8");
		const changed = await mergeWikiConfig(docsPath(), cfg);

		expect(changed).toBe(false);
		expect(await readFile(docsPath(), "utf8")).toBe(before);
	});

	it("preserves navigation and other content when modifying", async () => {
		await write(
			[
				`instances:`,
				`  - url: holocron.docs.buildwithfern.com/skills`,
				`    multi-source: true`,
				``,
				`title: skills Engineering`,
				``,
				`tabs:`,
				`  decisions:`,
				`    display-name: Decisions`,
				``,
				`navigation:`,
				`  - tab: decisions`,
				`    layout:`,
				`      - page: Index`,
				`        path: ../docs/wiki/decisions/README.md`,
				``,
				`colors:`,
				`  accent-primary:`,
				`    dark: "#70E155"`,
			].join("\n")
		);

		await mergeWikiConfig(docsPath(), cfg);

		const result = await readFile(docsPath(), "utf8");
		expect(result).toContain("tab: decisions");
		expect(result).toContain("path: ../docs/wiki/decisions/README.md");
		expect(result).toContain("title: skills Engineering");
	});

	it("adds edit-this-page after custom-domain when no multi-source line", async () => {
		await write(
			[
				`instances:`,
				`  - url: holocron.docs.buildwithfern.com/skills`,
				`    custom-domain: wiki.theholocron.dev/skills`,
				``,
				`title: skills Engineering`,
				``,
				`colors:`,
				`  accent-primary:`,
				`    dark: "#70E155"`,
			].join("\n")
		);

		await mergeWikiConfig(docsPath(), cfg);

		const result = await readFile(docsPath(), "utf8");
		expect(result).toContain("edit-this-page:");
		const cdIdx = result.indexOf("    custom-domain:");
		const etpIdx = result.indexOf("    edit-this-page:");
		expect(etpIdx).toBeGreaterThan(cdIdx);
	});

	it("adds edit-this-page after url when only url is present", async () => {
		await write(
			[
				`instances:`,
				`  - url: holocron.docs.buildwithfern.com/skills`,
				``,
				`title: skills Engineering`,
				``,
				`colors:`,
				`  accent-primary:`,
				`    dark: "#70E155"`,
			].join("\n")
		);

		await mergeWikiConfig(docsPath(), cfg);

		const result = await readFile(docsPath(), "utf8");
		expect(result).toContain("edit-this-page:");
	});

	it("appends navbar-links at end when no colors: key exists", async () => {
		await write(
			[
				`instances:`,
				`  - url: holocron.docs.buildwithfern.com/skills`,
				`    multi-source: true`,
				``,
				`title: skills Engineering`,
			].join("\n")
		);

		await mergeWikiConfig(docsPath(), cfg);

		const result = await readFile(docsPath(), "utf8");
		expect(result).toContain("navbar-links:");
		expect(result).toContain("https://github.com/theholocron/skills");
		// Should appear at the end since there's no colors: anchor
		expect(result.trimEnd()).toMatch(/navbar-links:[^\n]*/);
	});

	it("throws when fern/docs.yml does not exist", async () => {
		await expect(mergeWikiConfig(join(tmpDir, "fern", "missing.yml"), cfg)).rejects.toThrow(
			"fern/docs.yml not found"
		);
	});
});

// ---------------------------------------------------------------------------
// validateWikiConfig
// ---------------------------------------------------------------------------

describe("validateWikiConfig", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-wiki-validate-test-"));
		await mkdir(join(tmpDir, "fern"), { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	const docsPath = () => join(tmpDir, "fern", "docs.yml");

	it("returns empty array when both fields present", async () => {
		await writeFile(
			docsPath(),
			[
				`instances:`,
				`  - url: org.docs.buildwithfern.com/r`,
				`    edit-this-page:`,
				`      github:`,
				`        owner: org`,
				`        repo: r`,
				`        branch: main`,
				``,
				`navbar-links:`,
				`  - type: github`,
				`    value: https://github.com/org/r`,
			].join("\n"),
			"utf8"
		);

		expect(await validateWikiConfig(docsPath())).toEqual([]);
	});

	it("reports both missing fields", async () => {
		await writeFile(docsPath(), "instances:\n  - url: org.docs.buildwithfern.com/r\n", "utf8");
		const missing = await validateWikiConfig(docsPath());
		expect(missing).toContain("edit-this-page");
		expect(missing).toContain("navbar-links");
	});

	it("reports file not found", async () => {
		const missing = await validateWikiConfig(join(tmpDir, "fern", "missing.yml"));
		expect(missing).toContain("fern/docs.yml not found");
	});
});

// ---------------------------------------------------------------------------
// runSyncWiki
// ---------------------------------------------------------------------------

describe("runSyncWiki", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-wiki-run-test-"));
		await mkdir(join(tmpDir, "fern"), { recursive: true });
		await writeFile(
			join(tmpDir, "fern", "docs.yml"),
			[
				`instances:`,
				`  - url: org.docs.buildwithfern.com/myrepo`,
				`    custom-domain: wiki.example.com/myrepo`,
				`    multi-source: true`,
				``,
				`title: myrepo Engineering`,
				``,
				`colors:`,
				`  accent-primary:`,
				`    dark: "#000000"`,
			].join("\n"),
			"utf8"
		);
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	it("skips when no wiki provider is configured", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });
		const result = await runSyncWiki({ loaded, context: { repoRoot: tmpDir } });
		expect(result.status).toBe("skip");
		expect(result.message).toContain("no wiki provider configured");
	});

	it("skips when no repo is available", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo" }] },
		});
		const result = await runSyncWiki({ loaded, context: { repoRoot: tmpDir }, token: "tok" });
		expect(result.status).toBe("skip");
		expect(result.message).toContain("no repo configured");
	});

	it("skips when no token is available", async () => {
		const origRead = process.env.HOLOCRON_READ_TOKEN;
		const origGh = process.env.GH_TOKEN;
		const origGithub = process.env.GITHUB_TOKEN;
		delete process.env.HOLOCRON_READ_TOKEN;
		delete process.env.GH_TOKEN;
		delete process.env.GITHUB_TOKEN;

		try {
			const loaded = loadedFrom({
				name: "demo",
				org: "org",
				providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo" }] },
			});
			const result = await runSyncWiki({ loaded, context: { repoRoot: tmpDir, repo: "org/myrepo" } });
			expect(result.status).toBe("skip");
			expect(result.message).toContain("no GitHub token");
		} finally {
			if (origRead !== undefined) process.env.HOLOCRON_READ_TOKEN = origRead;
			if (origGh !== undefined) process.env.GH_TOKEN = origGh;
			if (origGithub !== undefined) process.env.GITHUB_TOKEN = origGithub;
		}
	});

	it("skips when repo is not in owner/name format", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo" }] },
		});
		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, repo: "noslash" },
			token: "tok",
		});
		expect(result.status).toBe("skip");
		expect(result.message).toContain("owner/name");
	});

	it("returns dry-run when dryRun is true", async () => {
		const loaded = loadedFrom({
			name: "demo",
			org: "org",
			providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo" }] },
		});
		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, dryRun: true, repo: "org/myrepo" },
			token: "tok",
		});
		expect(result.status).toBe("dry-run");
	});

	it("discovers wikis, builds shared navbar, and returns ok", async () => {
		const loaded = loadedFrom({
			name: "demo",
			org: "org",
			providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo" }] },
		});

		const fetch = makeOrgFetch([
			{
				name: "myrepo",
				full_name: "org/myrepo",
				configJson: { providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo" }] } },
			},
			{
				name: "other",
				full_name: "org/other",
				configJson: { providers: { wiki: ["fern", { domain: "wiki.example.com/other" }] } },
			},
		]);

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, repo: "org/myrepo" },
			token: "tok",
			fetch: fetch as typeof globalThis.fetch,
		});

		expect(result.status).toBe("ok");
		expect(result.message).toContain("2 wiki repos discovered");

		const docs = await readFile(join(tmpDir, "fern", "docs.yml"), "utf8");
		expect(docs).toContain("edit-this-page:");
		expect(docs).toContain("navbar-links:");
		// GitHub button for own repo
		expect(docs).toContain("type: github");
		expect(docs).toContain("https://github.com/org/myrepo");
		// Minimal link to other wiki, not to self
		expect(docs).toContain("type: minimal");
		expect(docs).toContain("value: https://wiki.example.com/other");
		// Self-link does not appear as a nav value (custom-domain line is fine)
		expect(docs).not.toContain("value: https://wiki.example.com/myrepo");
	});

	it("returns fail when fern/docs.yml does not exist", async () => {
		await rm(join(tmpDir, "fern"), { recursive: true });

		const loaded = loadedFrom({
			name: "demo",
			org: "org",
			providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo" }] },
		});

		const fetch = makeOrgFetch([
			{
				name: "myrepo",
				full_name: "org/myrepo",
				configJson: { providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo" }] } },
			},
		]);

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, repo: "org/myrepo" },
			token: "tok",
			fetch: fetch as typeof globalThis.fetch,
		});

		expect(result.status).toBe("fail");
		expect(result.message).toContain("fern/docs.yml not found");
	});
});
