import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FERN_VERSION, FernWiki } from "../capabilities/wiki.js";

let repoRoot: string;

beforeEach(async () => {
	repoRoot = join(tmpdir(), `fern-wiki-test-${Date.now()}`);
	await mkdir(repoRoot, { recursive: true });
});

afterEach(async () => {
	await rm(repoRoot, { recursive: true, force: true });
});

describe("FernWiki.provision — fern.config.json", () => {
	it("writes org and pinned version", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		await wiki.provision();

		const raw = await readFile(join(repoRoot, "fern", "fern.config.json"), "utf8");
		const cfg = JSON.parse(raw) as { organization: string; version: string };
		expect(cfg.organization).toBe("myorg");
		expect(cfg.version).toBe(FERN_VERSION);
	});

	it("falls back to 'holocron' when org is not set", async () => {
		const wiki = new FernWiki({ repoRoot });
		await wiki.provision();

		const raw = await readFile(join(repoRoot, "fern", "fern.config.json"), "utf8");
		const cfg = JSON.parse(raw) as { organization: string };
		expect(cfg.organization).toBe("holocron");
	});

	it("writes valid JSON ending with a newline", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		await wiki.provision();

		const raw = await readFile(join(repoRoot, "fern", "fern.config.json"), "utf8");
		expect(raw.endsWith("\n")).toBe(true);
		expect(() => JSON.parse(raw)).not.toThrow();
	});

	it("overwrites fern.config.json on repeat runs", async () => {
		await new FernWiki({ repoRoot, org: "first" }).provision();
		await new FernWiki({ repoRoot, org: "second" }).provision();

		const raw = await readFile(join(repoRoot, "fern", "fern.config.json"), "utf8");
		expect((JSON.parse(raw) as { organization: string }).organization).toBe("second");
	});

	it("creates fern/ if it does not exist", async () => {
		await new FernWiki({ repoRoot, org: "myorg" }).provision();
		const stat = await import("node:fs/promises").then((fs) => fs.stat(join(repoRoot, "fern")));
		expect(stat.isDirectory()).toBe(true);
	});
});

describe("FernWiki.provision — docs.yml (no domain)", () => {
	it("scaffolds with plain buildwithfern URL and navigation tabs", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		await wiki.provision({ name: "Myorg" });

		const docs = await readFile(join(repoRoot, "fern", "docs.yml"), "utf8");
		expect(docs).toContain("url: myorg.docs.buildwithfern.com");
		expect(docs).not.toContain("custom-domain:");
		expect(docs).not.toContain("multi-source:");
		expect(docs).toContain("title: Myorg Engineering");
		expect(docs).toContain("tab: decisions");
		expect(docs).toContain("tab: engineering");
		expect(docs).toContain("path: ../docs/decisions/README.md");
		expect(docs).toContain("path: ../docs/engineering/README.md");
	});

	it("skips docs.yml when it already exists", async () => {
		const fernDir = join(repoRoot, "fern");
		await mkdir(fernDir, { recursive: true });
		await writeFile(join(fernDir, "docs.yml"), "existing", "utf8");

		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		const result = await wiki.provision();

		expect(await readFile(join(fernDir, "docs.yml"), "utf8")).toBe("existing");
		expect(result).toContain("skipped");
	});
});

describe("FernWiki.provision — docs.yml (base domain, multi-source)", () => {
	it("appends repo name as basepath when domain has no path", async () => {
		const wiki = new FernWiki({
			repoRoot,
			org: "myorg",
			repo: "owner/myrepo",
			domain: "wiki.example.com",
		});
		await wiki.provision({ name: "Myrepo" });

		const docs = await readFile(join(repoRoot, "fern", "docs.yml"), "utf8");
		expect(docs).toContain("url: myorg.docs.buildwithfern.com/myrepo");
		expect(docs).toContain("custom-domain: wiki.example.com/myrepo");
		expect(docs).toContain("multi-source: true");
	});

	it("uses domain as-is (no multi-source) when repo is not available", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg", domain: "wiki.example.com" });
		await wiki.provision();

		const docs = await readFile(join(repoRoot, "fern", "docs.yml"), "utf8");
		expect(docs).toContain("url: myorg.docs.buildwithfern.com");
		expect(docs).toContain("custom-domain: wiki.example.com");
		expect(docs).not.toContain("multi-source:");
	});
});

describe("FernWiki.provision — docs.yml (domain with explicit basepath)", () => {
	it("uses the supplied basepath when domain already contains one", async () => {
		const wiki = new FernWiki({
			repoRoot,
			org: "myorg",
			repo: "owner/myrepo",
			domain: "wiki.example.com/myrepo",
		});
		await wiki.provision();

		const docs = await readFile(join(repoRoot, "fern", "docs.yml"), "utf8");
		expect(docs).toContain("url: myorg.docs.buildwithfern.com/myrepo");
		expect(docs).toContain("custom-domain: wiki.example.com/myrepo");
		expect(docs).toContain("multi-source: true");
	});
});

describe("FernWiki.provision — summary", () => {
	it("returns a summary string mentioning both files", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		const result = await wiki.provision({ name: "Myorg" });
		expect(result).toContain("fern.config.json");
		expect(result).toContain("docs.yml");
	});

	it("includes multi-source note in summary when domain is set", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg", repo: "owner/myrepo", domain: "wiki.example.com" });
		const result = await wiki.provision();
		expect(result).toContain("multi-source");
	});
});
