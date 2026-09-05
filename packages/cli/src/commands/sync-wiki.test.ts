import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveConfig } from "../config/config.js";
import type { LoadedConfig } from "../config/load-config.js";
import { mergeWikiConfig, runSyncWiki, validateWikiConfig } from "./sync-wiki.js";

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return {
		resolved: resolveConfig(rawConfig),
		filepath: "/tmp/test/holocron.config.json",
	};
}

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

	const cfg = { owner: "theholocron", repoName: "skills" };
	const docsPath = () => join(tmpDir, "fern", "docs.yml");

	function write(content: string) {
		return writeFile(docsPath(), content, "utf8");
	}
	function read() {
		return readFile(docsPath(), "utf8");
	}

	it("adds edit-this-page after multi-source: true", async () => {
		await write([
			`instances:`,
			`  - url: holocron.docs.buildwithfern.com/skills`,
			`    custom-domain: wiki.theholocron.dev/skills`,
			`    multi-source: true`,
			``,
			`title: skills Engineering`,
			``,
			`colors:`,
			`  accent-primary:`,
			`    dark: "#70E155"`,
		].join("\n"));

		const changed = await mergeWikiConfig(docsPath(), cfg);

		expect(changed).toBe(true);
		const result = await read();
		expect(result).toContain("edit-this-page:");
		expect(result).toContain("        owner: theholocron");
		expect(result).toContain("        repo: skills");
		expect(result).toContain("        branch: main");
		// edit-this-page is indented under the instance (after multi-source: true)
		const msIdx = result.indexOf("    multi-source: true");
		const etpIdx = result.indexOf("    edit-this-page:");
		expect(etpIdx).toBeGreaterThan(msIdx);
	});

	it("adds edit-this-page after custom-domain when no multi-source line", async () => {
		await write([
			`instances:`,
			`  - url: holocron.docs.buildwithfern.com/skills`,
			`    custom-domain: wiki.theholocron.dev/skills`,
			``,
			`title: skills Engineering`,
			``,
			`colors:`,
			`  accent-primary:`,
			`    dark: "#70E155"`,
		].join("\n"));

		await mergeWikiConfig(docsPath(), cfg);

		const result = await read();
		expect(result).toContain("edit-this-page:");
		const cdIdx = result.indexOf("    custom-domain:");
		const etpIdx = result.indexOf("    edit-this-page:");
		expect(etpIdx).toBeGreaterThan(cdIdx);
	});

	it("adds edit-this-page after url when no custom-domain or multi-source", async () => {
		await write([
			`instances:`,
			`  - url: holocron.docs.buildwithfern.com/skills`,
			``,
			`title: skills Engineering`,
			``,
			`colors:`,
			`  accent-primary:`,
			`    dark: "#70E155"`,
		].join("\n"));

		await mergeWikiConfig(docsPath(), cfg);

		const result = await read();
		expect(result).toContain("edit-this-page:");
	});

	it("adds navbar-links before colors:", async () => {
		await write([
			`instances:`,
			`  - url: holocron.docs.buildwithfern.com/skills`,
			`    multi-source: true`,
			``,
			`title: skills Engineering`,
			``,
			`colors:`,
			`  accent-primary:`,
			`    dark: "#70E155"`,
		].join("\n"));

		await mergeWikiConfig(docsPath(), cfg);

		const result = await read();
		expect(result).toContain("navbar-links:");
		expect(result).toContain("  - type: github");
		expect(result).toContain("    value: https://github.com/theholocron/skills");
		const navbarIdx = result.indexOf("navbar-links:");
		const colorsIdx = result.indexOf("colors:");
		expect(navbarIdx).toBeLessThan(colorsIdx);
	});

	it("appends navbar-links at end when no colors: key", async () => {
		await write([
			`instances:`,
			`  - url: holocron.docs.buildwithfern.com/skills`,
			`    multi-source: true`,
			``,
			`title: skills Engineering`,
		].join("\n"));

		await mergeWikiConfig(docsPath(), cfg);

		const result = await read();
		expect(result).toContain("navbar-links:");
		expect(result).toContain("https://github.com/theholocron/skills");
	});

	it("is idempotent when both fields already present", async () => {
		await write([
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
			``,
			`colors:`,
			`  accent-primary:`,
			`    dark: "#70E155"`,
		].join("\n"));

		const before = await read();
		const changed = await mergeWikiConfig(docsPath(), cfg);

		expect(changed).toBe(false);
		expect(await read()).toBe(before);
	});

	it("adds both fields and returns true when both are absent", async () => {
		await write([
			`instances:`,
			`  - url: holocron.docs.buildwithfern.com/skills`,
			`    multi-source: true`,
			``,
			`title: skills Engineering`,
			``,
			`colors:`,
			`  accent-primary:`,
			`    dark: "#70E155"`,
		].join("\n"));

		const changed = await mergeWikiConfig(docsPath(), cfg);
		expect(changed).toBe(true);
		const result = await read();
		expect(result).toContain("edit-this-page:");
		expect(result).toContain("navbar-links:");
	});

	it("preserves all other content when modifying", async () => {
		await write([
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
		].join("\n"));

		await mergeWikiConfig(docsPath(), cfg);

		const result = await read();
		expect(result).toContain("tab: decisions");
		expect(result).toContain("path: ../docs/wiki/decisions/README.md");
		expect(result).toContain("title: skills Engineering");
	});

	it("throws when docs.yml does not exist", async () => {
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

	it("returns empty array when both fields are present", async () => {
		await writeFile(docsPath(), [
			`instances:`,
			`  - url: holocron.docs.buildwithfern.com/skills`,
			`    multi-source: true`,
			`    edit-this-page:`,
			`      github:`,
			`        owner: theholocron`,
			`        repo: skills`,
			`        branch: main`,
			``,
			`navbar-links:`,
			`  - type: github`,
			`    value: https://github.com/theholocron/skills`,
		].join("\n"), "utf8");

		const missing = await validateWikiConfig(docsPath());
		expect(missing).toEqual([]);
	});

	it("reports edit-this-page missing", async () => {
		await writeFile(docsPath(), [
			`instances:`,
			`  - url: holocron.docs.buildwithfern.com/skills`,
			`    multi-source: true`,
			``,
			`navbar-links:`,
			`  - type: github`,
			`    value: https://github.com/theholocron/skills`,
		].join("\n"), "utf8");

		const missing = await validateWikiConfig(docsPath());
		expect(missing).toContain("edit-this-page");
		expect(missing).not.toContain("navbar-links");
	});

	it("reports navbar-links missing", async () => {
		await writeFile(docsPath(), [
			`instances:`,
			`  - url: holocron.docs.buildwithfern.com/skills`,
			`    multi-source: true`,
			`    edit-this-page:`,
			`      github:`,
			`        owner: theholocron`,
			`        repo: skills`,
			`        branch: main`,
		].join("\n"), "utf8");

		const missing = await validateWikiConfig(docsPath());
		expect(missing).toContain("navbar-links");
		expect(missing).not.toContain("edit-this-page");
	});

	it("reports both missing when neither is present", async () => {
		await writeFile(docsPath(), "instances:\n  - url: holocron.docs.buildwithfern.com/skills\n", "utf8");

		const missing = await validateWikiConfig(docsPath());
		expect(missing).toContain("edit-this-page");
		expect(missing).toContain("navbar-links");
	});

	it("reports file not found when docs.yml is absent", async () => {
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
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		const result = await runSyncWiki({ loaded, context: { repoRoot: tmpDir } });

		expect(result.status).toBe("skip");
		expect(result.message).toContain("no repo configured");
	});

	it("skips when repo string is not owner/name format", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, repo: "noslash" },
		});

		expect(result.status).toBe("skip");
		expect(result.message).toContain("owner/name");
	});

	it("returns dry-run when dryRun is true", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, dryRun: true, repo: "org/myrepo" },
		});

		expect(result.status).toBe("dry-run");
	});

	it("merges wiki config and returns ok with changed message", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo", fernOrg: "org" }] },
		});

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, repo: "org/myrepo" },
		});

		expect(result.status).toBe("ok");
		expect(result.message).toContain("added missing wiki header fields");

		const docs = await readFile(join(tmpDir, "fern", "docs.yml"), "utf8");
		expect(docs).toContain("edit-this-page:");
		expect(docs).toContain("        owner: org");
		expect(docs).toContain("        repo: myrepo");
		expect(docs).toContain("navbar-links:");
		expect(docs).toContain("https://github.com/org/myrepo");
	});

	it("returns ok with up-to-date message when nothing to change", async () => {
		// Pre-populate with all required fields
		await writeFile(
			join(tmpDir, "fern", "docs.yml"),
			[
				`instances:`,
				`  - url: org.docs.buildwithfern.com/myrepo`,
				`    multi-source: true`,
				`    edit-this-page:`,
				`      github:`,
				`        owner: org`,
				`        repo: myrepo`,
				`        branch: main`,
				``,
				`title: myrepo Engineering`,
				``,
				`navbar-links:`,
				`  - type: github`,
				`    value: https://github.com/org/myrepo`,
				``,
				`colors:`,
				`  accent-primary:`,
				`    dark: "#000000"`,
			].join("\n"),
			"utf8"
		);

		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo", fernOrg: "org" }] },
		});

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, repo: "org/myrepo" },
		});

		expect(result.status).toBe("ok");
		expect(result.message).toContain("up to date");
	});

	it("uses context.repo over config.repo.name", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, repo: "ctx-owner/ctx-repo" },
		});

		expect(result.status).toBe("ok");
		const docs = await readFile(join(tmpDir, "fern", "docs.yml"), "utf8");
		expect(docs).toContain("owner: ctx-owner");
		expect(docs).toContain("repo: ctx-repo");
	});

	it("returns fail when fern/docs.yml does not exist", async () => {
		await rm(join(tmpDir, "fern"), { recursive: true });

		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo", fernOrg: "org" }] },
		});

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, repo: "org/myrepo" },
		});

		expect(result.status).toBe("fail");
		expect(result.message).toContain("fern/docs.yml not found");
	});
});
