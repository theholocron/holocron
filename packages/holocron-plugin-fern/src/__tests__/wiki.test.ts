import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

	it("falls back to process.cwd() when repoRoot is not provided", async () => {
		const cwd = process.cwd();
		const fernConfig = join(cwd, "fern", "fern.config.json");
		try {
			await new FernWiki({ org: "myorg" }).provision();
			const raw = await readFile(fernConfig, "utf8");
			expect((JSON.parse(raw) as { organization: string }).organization).toBe("myorg");
		} finally {
			await rm(join(cwd, "fern"), { recursive: true, force: true });
		}
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
		expect(docs).toContain("tab: standards");
		expect(docs).toContain("tab: specifications");
		expect(docs).toContain("path: ../docs/wiki/decisions/README.md");
		expect(docs).toContain("path: ../docs/wiki/standards/README.md");
		expect(docs).toContain("path: ../docs/wiki/specifications/README.md");
	});

	it("updates instances block in existing docs.yml without touching navigation", async () => {
		const fernDir = join(repoRoot, "fern");
		await mkdir(fernDir, { recursive: true });
		const existing = [
			`# yaml-language-server: $schema=https://schema.buildwithfern.dev/docs-yml.json`,
			``,
			`instances:`,
			`  - url: myorg.docs.buildwithfern.com`,
			``,
			`title: Myorg Engineering`,
			``,
			`navigation:`,
			`  - tab: decisions`,
			`    layout:`,
			`      - page: ADR-0001`,
			`        path: ../docs/decisions/0001.md`,
			``,
		].join("\n");
		await writeFile(join(fernDir, "docs.yml"), existing, "utf8");

		const wiki = new FernWiki({ repoRoot, org: "myorg", repo: "owner/myrepo", domain: "wiki.example.com" });
		const result = await wiki.provision();

		const updated = await readFile(join(fernDir, "docs.yml"), "utf8");
		expect(updated).toContain("url: myorg.docs.buildwithfern.com/myrepo");
		expect(updated).toContain("custom-domain: wiki.example.com/myrepo");
		expect(updated).toContain("multi-source: true");
		// Navigation preserved
		expect(updated).toContain("ADR-0001");
		expect(updated).toContain("title: Myorg Engineering");
		expect(result).toContain("updated instances");
	});

	it("preserves blank separator between instances and the next key when updating", async () => {
		const fernDir = join(repoRoot, "fern");
		await mkdir(fernDir, { recursive: true });
		const existing = [
			`instances:`,
			`  - url: myorg.docs.buildwithfern.com`,
			``,
			`title: Myorg Engineering`,
			``,
		].join("\n");
		await writeFile(join(fernDir, "docs.yml"), existing, "utf8");

		const wiki = new FernWiki({ repoRoot, org: "myorg", repo: "owner/myrepo", domain: "wiki.example.com" });
		await wiki.provision();

		const updated = await readFile(join(fernDir, "docs.yml"), "utf8");
		expect(updated).toContain("multi-source: true");
		expect(updated).toContain("title: Myorg Engineering");
		// Blank line separator preserved
		expect(updated).toMatch(/multi-source: true\n+title:/);
	});

	it("includes domain without multi-source in summary when no repo is set", async () => {
		const fernDir = join(repoRoot, "fern");
		await mkdir(fernDir, { recursive: true });
		await writeFile(
			join(fernDir, "docs.yml"),
			"instances:\n  - url: myorg.docs.buildwithfern.com\n\ntitle: Foo\n",
			"utf8"
		);

		const wiki = new FernWiki({ repoRoot, org: "myorg", domain: "wiki.example.com" });
		const result = await wiki.provision();

		expect(result).toContain("domain=wiki.example.com");
		expect(result).not.toContain("multi-source");
	});

	it("leaves docs.yml unchanged when it has no instances block", async () => {
		const fernDir = join(repoRoot, "fern");
		await mkdir(fernDir, { recursive: true });
		const content = "title: No instances here\n";
		await writeFile(join(fernDir, "docs.yml"), content, "utf8");

		const wiki = new FernWiki({ repoRoot, org: "myorg", domain: "wiki.example.com" });
		await wiki.provision();

		expect(await readFile(join(fernDir, "docs.yml"), "utf8")).toBe(content);
	});

	it("updates without a blank separator when none exists in original", async () => {
		const fernDir = join(repoRoot, "fern");
		await mkdir(fernDir, { recursive: true });
		const existing = "instances:\n  - url: myorg.docs.buildwithfern.com\ntitle: Foo\n";
		await writeFile(join(fernDir, "docs.yml"), existing, "utf8");

		const wiki = new FernWiki({ repoRoot, org: "myorg", repo: "owner/myrepo", domain: "wiki.example.com" });
		await wiki.provision();

		const updated = await readFile(join(fernDir, "docs.yml"), "utf8");
		expect(updated).toContain("multi-source: true");
		expect(updated).toContain("title: Foo");
	});

	it("reports up to date when instances block already matches", async () => {
		const fernDir = join(repoRoot, "fern");
		await mkdir(fernDir, { recursive: true });
		const existing = [
			`instances:`,
			`  - url: myorg.docs.buildwithfern.com/myrepo`,
			`    custom-domain: wiki.example.com/myrepo`,
			`    multi-source: true`,
			``,
			`title: Myorg Engineering`,
			``,
		].join("\n");
		await writeFile(join(fernDir, "docs.yml"), existing, "utf8");

		const wiki = new FernWiki({ repoRoot, org: "myorg", repo: "owner/myrepo", domain: "wiki.example.com" });
		const result = await wiki.provision();

		expect(result).toContain("up to date");
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

describe("FernWiki.dnsRecord", () => {
	it("returns null when no domain is set", () => {
		expect(new FernWiki({ org: "myorg" }).dnsRecord()).toBeNull();
	});

	it("returns CNAME record for a bare domain", () => {
		const record = new FernWiki({ org: "myorg", domain: "wiki.example.com" }).dnsRecord();
		expect(record).toEqual({
			zone: "example.com",
			cname: "wiki.example.com",
			target: "myorg.docs.buildwithfern.com",
		});
	});

	it("strips basepath from domain when deriving the CNAME hostname", () => {
		const record = new FernWiki({
			org: "myorg",
			repo: "owner/myrepo",
			domain: "wiki.example.com/myrepo",
		}).dnsRecord();
		expect(record?.cname).toBe("wiki.example.com");
		expect(record?.zone).toBe("example.com");
	});

	it("uses fernOrg over org for the CNAME target", () => {
		const record = new FernWiki({
			org: "theholocron",
			fernOrg: "holocron",
			domain: "wiki.example.com",
		}).dnsRecord();
		expect(record?.target).toBe("holocron.docs.buildwithfern.com");
	});

	it("falls back to 'holocron' when neither fernOrg nor org is set", () => {
		const record = new FernWiki({ domain: "wiki.example.com" }).dnsRecord();
		expect(record?.target).toBe("holocron.docs.buildwithfern.com");
	});
});

describe("FernWiki.proxyConfig", () => {
	it("returns null when no domain is set", () => {
		expect(new FernWiki({ org: "myorg" }).proxyConfig()).toBeNull();
	});

	it("returns proxy config targeting app.buildwithfern.com", () => {
		const config = new FernWiki({ org: "myorg", domain: "wiki.example.com" }).proxyConfig();
		expect(config?.target).toBe("https://app.buildwithfern.com");
	});

	it("sets X-Fern-Host header to the hostname without basepath", () => {
		const config = new FernWiki({
			org: "myorg",
			repo: "owner/myrepo",
			domain: "wiki.example.com/myrepo",
		}).proxyConfig();
		expect(config?.headers).toEqual({ "X-Fern-Host": "wiki.example.com" });
	});
});
