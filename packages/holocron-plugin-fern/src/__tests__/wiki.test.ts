import { mkdir, readFile, rm } from "node:fs/promises";
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

describe("FernWiki.provision", () => {
	it("writes fern.config.json with org and pinned version", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		await wiki.provision();

		const raw = await readFile(join(repoRoot, "fern", "fern.config.json"), "utf8");
		const cfg = JSON.parse(raw) as { organization: string; version: string };
		expect(cfg.organization).toBe("myorg");
		expect(cfg.version).toBe(FERN_VERSION);
	});

	it("falls back to 'holocron' org when org is not provided", async () => {
		const wiki = new FernWiki({ repoRoot });
		await wiki.provision();

		const raw = await readFile(join(repoRoot, "fern", "fern.config.json"), "utf8");
		const cfg = JSON.parse(raw) as { organization: string };
		expect(cfg.organization).toBe("holocron");
	});

	it("writes fern.config.json as valid JSON ending with newline", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		await wiki.provision();

		const raw = await readFile(join(repoRoot, "fern", "fern.config.json"), "utf8");
		expect(raw.endsWith("\n")).toBe(true);
		expect(() => JSON.parse(raw)).not.toThrow();
	});

	it("scaffolds docs.yml with instance URL and navigation tabs", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		await wiki.provision({ name: "Myorg" });

		const docs = await readFile(join(repoRoot, "fern", "docs.yml"), "utf8");
		expect(docs).toContain("url: myorg.docs.buildwithfern.com");
		expect(docs).toContain("title: Myorg Engineering");
		expect(docs).toContain("tab: decisions");
		expect(docs).toContain("tab: engineering");
		expect(docs).toContain("path: ../docs/decisions/README.md");
		expect(docs).toContain("path: ../docs/engineering/README.md");
	});

	it("includes custom-domain in docs.yml when domain is set", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg", domain: "engineering.myorg.dev" });
		await wiki.provision();

		const docs = await readFile(join(repoRoot, "fern", "docs.yml"), "utf8");
		expect(docs).toContain("custom-domain: engineering.myorg.dev");
	});

	it("skips docs.yml when the file already exists", async () => {
		const fernDir = join(repoRoot, "fern");
		await mkdir(fernDir, { recursive: true });
		await import("node:fs/promises").then((fs) => fs.writeFile(join(fernDir, "docs.yml"), "existing", "utf8"));

		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		const result = await wiki.provision();

		const docs = await readFile(join(fernDir, "docs.yml"), "utf8");
		expect(docs).toBe("existing");
		expect(result).toContain("skipped");
	});

	it("overwrites fern.config.json on repeat runs", async () => {
		const wiki = new FernWiki({ repoRoot, org: "first" });
		await wiki.provision();

		const wiki2 = new FernWiki({ repoRoot, org: "second" });
		await wiki2.provision();

		const raw = await readFile(join(repoRoot, "fern", "fern.config.json"), "utf8");
		const cfg = JSON.parse(raw) as { organization: string };
		expect(cfg.organization).toBe("second");
	});

	it("creates the fern/ directory if it does not exist", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		await wiki.provision();

		const stat = await import("node:fs/promises").then((fs) => fs.stat(join(repoRoot, "fern")));
		expect(stat.isDirectory()).toBe(true);
	});

	it("returns a summary string", async () => {
		const wiki = new FernWiki({ repoRoot, org: "myorg" });
		const result = await wiki.provision({ name: "Myorg" });
		expect(result).toContain("fern.config.json");
		expect(result).toContain("docs.yml");
	});
});
