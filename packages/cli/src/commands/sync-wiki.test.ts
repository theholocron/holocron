import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveConfig } from "../config/config.js";
import type { LoadedConfig } from "../config/load-config.js";
import { discoverWikiProducts, mergeProducts, runSyncWiki } from "./sync-wiki.js";

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
			// Second page is always empty — all repos fit on page 1 in tests
			return new Response(JSON.stringify([]), { status: 200 });
		}

		for (const repo of repos) {
			if (urlStr.includes(`/repos/${repo.full_name}/contents/holocron.config.json`)) {
				if (!repo.configJson)
					return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
				const content = Buffer.from(JSON.stringify(repo.configJson)).toString("base64");
				return new Response(
					JSON.stringify({ content: content + "\n", encoding: "base64" }),
					{ status: 200 }
				);
			}
			if (urlStr.includes(`/repos/${repo.full_name}/contents/holocron.config.ts`)) {
				if (!repo.configTs)
					return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
				const content = Buffer.from(repo.configTs).toString("base64");
				return new Response(
					JSON.stringify({ content: content + "\n", encoding: "base64" }),
					{ status: 200 }
				);
			}
		}

		return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
	};
}

// ---------------------------------------------------------------------------
// discoverWikiProducts
// ---------------------------------------------------------------------------

describe("discoverWikiProducts", () => {
	it("returns empty array when no repos have wiki configured", async () => {
		const fetch = makeOrgFetch([
			{
				name: "no-wiki",
				full_name: "org/no-wiki",
				configJson: { name: "no-wiki", providers: { source: "github" } },
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products).toEqual([]);
	});

	it("discovers wiki from a JSON config with explicit domain path", async () => {
		const fetch = makeOrgFetch([
			{
				name: "myrepo",
				full_name: "org/myrepo",
				configJson: {
					name: "myrepo",
					description: "My repo description",
					providers: {
						wiki: ["fern", { domain: "wiki.example.com/myrepo", fernOrg: "org" }],
					},
				},
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products).toHaveLength(1);
		expect(products[0]).toMatchObject({
			displayName: "Myrepo",
			basepath: "myrepo",
			subtitle: "My repo description",
		});
	});

	it("derives basepath from repo name when domain has no path segment", async () => {
		const fetch = makeOrgFetch([
			{
				name: "myrepo",
				full_name: "org/myrepo",
				configJson: {
					name: "myrepo",
					providers: {
						wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }],
					},
				},
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products[0]?.basepath).toBe("myrepo");
		expect(products[0]?.displayName).toBe("Myrepo");
	});

	it("uses subtitle and icon from wiki options when provided", async () => {
		const fetch = makeOrgFetch([
			{
				name: "myrepo",
				full_name: "org/myrepo",
				configJson: {
					name: "myrepo",
					description: "Fallback",
					providers: {
						wiki: [
							"fern",
							{
								domain: "wiki.example.com/myrepo",
								subtitle: "Custom subtitle",
								icon: "fa-duotone fa-gear",
							},
						],
					},
				},
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products[0]?.subtitle).toBe("Custom subtitle");
		expect(products[0]?.icon).toBe("fa-duotone fa-gear");
	});

	it("falls back to description when subtitle is absent in JSON config", async () => {
		const fetch = makeOrgFetch([
			{
				name: "myrepo",
				full_name: "org/myrepo",
				configJson: {
					description: "Top-level description",
					providers: {
						wiki: ["fern", { domain: "wiki.example.com/myrepo" }],
					},
				},
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products[0]?.subtitle).toBe("Top-level description");
	});

	it("discovers wiki from a TS config using wikiCapability preset", async () => {
		const fetch = makeOrgFetch([
			{
				name: "skills",
				full_name: "org/skills",
				configTs: `
import { compose, nodeDocsSite, wikiCapability as wiki } from "@theholocron/holocron-config";
const preset = compose(nodeDocsSite(), wiki());
export default defineConfig({
	...preset,
	description: "Shared agent skill registry.",
});
`,
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products).toHaveLength(1);
		expect(products[0]?.basepath).toBe("skills");
		expect(products[0]?.subtitle).toBe("Shared agent skill registry.");
	});

	it("discovers wiki from a TS config with direct providers.wiki", async () => {
		const fetch = makeOrgFetch([
			{
				name: "holocron",
				full_name: "org/holocron",
				configTs: `
export default defineConfig({
	name: "holocron",
	description: "The CLI",
	providers: {
		source: "github",
		wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }],
	},
});
`,
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products[0]?.basepath).toBe("holocron");
	});

	it("falls back to TS config when JSON config is absent", async () => {
		const fetch = makeOrgFetch([
			{
				name: "myrepo",
				full_name: "org/myrepo",
				configTs: `
export default defineConfig({
	providers: { wiki: ["fern", { domain: "wiki.example.com/myrepo" }] },
	description: "From TS",
});
`,
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products[0]?.basepath).toBe("myrepo");
		expect(products[0]?.subtitle).toBe("From TS");
	});

	it("skips archived repos", async () => {
		const fetch = makeOrgFetch([
			{
				name: "archived-repo",
				full_name: "org/archived-repo",
				archived: true,
				configJson: {
					providers: { wiki: ["fern", { domain: "wiki.example.com/archived-repo" }] },
				},
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products).toHaveLength(0);
	});

	it("sorts products alphabetically by basepath", async () => {
		const fetch = makeOrgFetch([
			{
				name: "zeta",
				full_name: "org/zeta",
				configJson: {
					providers: { wiki: ["fern", { domain: "wiki.example.com/zeta" }] },
				},
			},
			{
				name: "alpha",
				full_name: "org/alpha",
				configJson: {
					providers: { wiki: ["fern", { domain: "wiki.example.com/alpha" }] },
				},
			},
			{
				name: "mu",
				full_name: "org/mu",
				configJson: {
					providers: { wiki: ["fern", { domain: "wiki.example.com/mu" }] },
				},
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products.map((p) => p.basepath)).toEqual(["alpha", "mu", "zeta"]);
	});

	it("skips repos with no wiki config", async () => {
		const fetch = makeOrgFetch([
			{
				name: "has-wiki",
				full_name: "org/has-wiki",
				configJson: {
					providers: { wiki: ["fern", { domain: "wiki.example.com/has-wiki" }] },
				},
			},
			{
				name: "no-wiki",
				full_name: "org/no-wiki",
				configJson: { providers: { source: "github" } },
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products).toHaveLength(1);
		expect(products[0]?.basepath).toBe("has-wiki");
	});

	it("skips repo when config JSON is invalid", async () => {
		const fetch = makeOrgFetch([
			{
				name: "bad-json",
				full_name: "org/bad-json",
				// configJson is absent — we inject a raw invalid-JSON response below
			},
		]);
		// Wrap fetch to return malformed JSON for the config file
		const wrappedFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
			if (url.toString().includes("/contents/holocron.config.json")) {
				const content = Buffer.from("this is not json {{{").toString("base64");
				return new Response(JSON.stringify({ content, encoding: "base64" }), { status: 200 });
			}
			return fetch(url, init);
		};

		const products = await discoverWikiProducts("org", "token", wrappedFetch as typeof globalThis.fetch);
		expect(products).toHaveLength(0);
	});

	it("skips repo when config file uses non-base64 encoding", async () => {
		const fetch = makeOrgFetch([{ name: "weird", full_name: "org/weird" }]);
		const wrappedFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
			if (url.toString().includes("/contents/holocron.config.json")) {
				return new Response(
					JSON.stringify({ content: "raw content", encoding: "utf-8" }),
					{ status: 200 }
				);
			}
			if (url.toString().includes("/contents/holocron.config.ts")) {
				return new Response(
					JSON.stringify({ content: "raw content", encoding: "utf-8" }),
					{ status: 200 }
				);
			}
			return fetch(url, init);
		};

		const products = await discoverWikiProducts("org", "token", wrappedFetch as typeof globalThis.fetch);
		expect(products).toHaveLength(0);
	});

	it("fetches a second page when first page returns exactly 100 repos", async () => {
		// Build 100 non-wiki repos for page 1 and 1 wiki repo for page 2
		const page1Repos = Array.from({ length: 100 }, (_, i) => ({
			name: `repo-${i}`,
			full_name: `org/repo-${i}`,
			archived: false,
		}));
		const page2Repo = {
			name: "wiki-repo",
			full_name: "org/wiki-repo",
			archived: false,
		};

		let callCount = 0;
		const paginatedFetch = async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
			const urlStr = url.toString();
			if (urlStr.includes("/orgs/") && urlStr.includes("/repos")) {
				const page = new URL(urlStr).searchParams.get("page") ?? "1";
				if (page === "1") return new Response(JSON.stringify(page1Repos), { status: 200 });
				if (page === "2") return new Response(JSON.stringify([page2Repo]), { status: 200 });
				return new Response(JSON.stringify([]), { status: 200 });
			}
			if (urlStr.includes("/repos/org/wiki-repo/contents/holocron.config.json")) {
				callCount++;
				const content = Buffer.from(
					JSON.stringify({ providers: { wiki: ["fern", { domain: "wiki.example.com/wiki-repo" }] } })
				).toString("base64");
				return new Response(JSON.stringify({ content, encoding: "base64" }), { status: 200 });
			}
			// All other repos: no config
			return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
		};

		const products = await discoverWikiProducts("org", "token", paginatedFetch as typeof globalThis.fetch);
		expect(products).toHaveLength(1);
		expect(products[0]?.basepath).toBe("wiki-repo");
		expect(callCount).toBe(1);
	});

	it("ignores TS config that has no wiki markers", async () => {
		const fetch = makeOrgFetch([
			{
				name: "no-wiki-ts",
				full_name: "org/no-wiki-ts",
				configTs: `
export default defineConfig({
	name: "no-wiki-ts",
	providers: { source: "github" },
});
`,
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products).toHaveLength(0);
	});

	it("extracts subtitle and icon from TS config when present", async () => {
		const fetch = makeOrgFetch([
			{
				name: "styled",
				full_name: "org/styled",
				configTs: `
export default defineConfig({
	providers: { wiki: ["fern", { domain: "wiki.example.com/styled", subtitle: "A styled wiki", icon: "fa-duotone fa-star" }] },
});
`,
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products[0]?.subtitle).toBe("A styled wiki");
		expect(products[0]?.icon).toBe("fa-duotone fa-star");
	});

	it("handles bare string wiki provider in JSON config", async () => {
		const fetch = makeOrgFetch([
			{
				name: "bare",
				full_name: "org/bare",
				configJson: {
					name: "bare",
					providers: { wiki: "fern" },
				},
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products).toHaveLength(1);
		expect(products[0]?.basepath).toBe("bare");
		expect(products[0]?.displayName).toBe("Bare");
		expect(products[0]?.subtitle).toBeUndefined();
	});

	it("ignores non-string domain in wiki options tuple", async () => {
		const fetch = makeOrgFetch([
			{
				name: "myrepo",
				full_name: "org/myrepo",
				configJson: {
					name: "myrepo",
					providers: { wiki: ["fern", { domain: 42, fernOrg: "org" }] },
				},
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		// domain is not a string → basepath derived from repo name
		expect(products[0]?.basepath).toBe("myrepo");
	});

	it("produces product with no subtitle when TS config has no description or subtitle", async () => {
		const fetch = makeOrgFetch([
			{
				name: "minimal",
				full_name: "org/minimal",
				configTs: `
export default {
	providers: { wiki: ["fern", { domain: "wiki.example.com/minimal" }] },
};
`,
			},
		]);

		const products = await discoverWikiProducts("org", "token", fetch as typeof globalThis.fetch);
		expect(products[0]?.basepath).toBe("minimal");
		expect(products[0]?.subtitle).toBeUndefined();
		expect(products[0]?.icon).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// mergeProducts
// ---------------------------------------------------------------------------

describe("mergeProducts", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-wiki-test-"));
		await mkdir(join(tmpDir, "fern"), { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	const products = [
		{ displayName: "Alpha", basepath: "alpha", subtitle: "Alpha tool" },
		{ displayName: "Beta", basepath: "beta", icon: "fa-duotone fa-b" },
	];

	it("inserts products: block before instances: when none exists", async () => {
		const initial = [
			"# yaml-language-server: $schema=https://schema.buildwithfern.dev/docs-yml.json",
			"",
			"instances:",
			"  - url: org.docs.buildwithfern.com/myrepo",
			"    custom-domain: wiki.example.com/myrepo",
			"",
			"title: myrepo Engineering",
		].join("\n");
		await writeFile(join(tmpDir, "fern", "docs.yml"), initial, "utf8");

		await mergeProducts(join(tmpDir, "fern", "docs.yml"), products);

		const result = await readFile(join(tmpDir, "fern", "docs.yml"), "utf8");
		expect(result).toContain("products:");
		expect(result).toContain("  - display-name: Alpha");
		expect(result).toContain("    subtitle: Alpha tool");
		expect(result).toContain("    href: /alpha");
		expect(result).toContain("  - display-name: Beta");
		expect(result).toContain("    icon: fa-duotone fa-b");
		expect(result).toContain("    href: /beta");
		// products: appears before instances:
		const productsIdx = result.indexOf("products:");
		const instancesIdx = result.indexOf("instances:");
		expect(productsIdx).toBeLessThan(instancesIdx);
		// original content preserved
		expect(result).toContain("title: myrepo Engineering");
	});

	it("replaces an existing products: block", async () => {
		const initial = [
			"instances:",
			"  - url: org.docs.buildwithfern.com/myrepo",
			"",
			"products:",
			"  - display-name: Old",
			"    href: /old",
			"",
			"title: myrepo Engineering",
		].join("\n");
		await writeFile(join(tmpDir, "fern", "docs.yml"), initial, "utf8");

		await mergeProducts(join(tmpDir, "fern", "docs.yml"), products);

		const result = await readFile(join(tmpDir, "fern", "docs.yml"), "utf8");
		expect(result).not.toContain("display-name: Old");
		expect(result).toContain("display-name: Alpha");
		expect(result).toContain("display-name: Beta");
		expect(result).toContain("title: myrepo Engineering");
	});

	it("replacement is idempotent", async () => {
		const initial = "instances:\n  - url: org.docs.buildwithfern.com/myrepo\n\ntitle: T\n";
		await writeFile(join(tmpDir, "fern", "docs.yml"), initial, "utf8");

		await mergeProducts(join(tmpDir, "fern", "docs.yml"), products);
		const after1 = await readFile(join(tmpDir, "fern", "docs.yml"), "utf8");

		await mergeProducts(join(tmpDir, "fern", "docs.yml"), products);
		const after2 = await readFile(join(tmpDir, "fern", "docs.yml"), "utf8");

		expect(after1).toBe(after2);
	});

	it("appends products: when no instances: marker exists", async () => {
		const initial = "title: myrepo Engineering\n";
		await writeFile(join(tmpDir, "fern", "docs.yml"), initial, "utf8");

		await mergeProducts(join(tmpDir, "fern", "docs.yml"), products);

		const result = await readFile(join(tmpDir, "fern", "docs.yml"), "utf8");
		expect(result).toContain("products:");
		expect(result).toContain("title: myrepo Engineering");
	});

	it("throws when docs.yml does not exist", async () => {
		await expect(
			mergeProducts(join(tmpDir, "fern", "missing.yml"), products)
		).rejects.toThrow("fern/docs.yml not found");
	});

	it("omits subtitle line when subtitle is absent", async () => {
		const initial = "instances:\n  - url: org.docs.buildwithfern.com/r\n";
		await writeFile(join(tmpDir, "fern", "docs.yml"), initial, "utf8");

		await mergeProducts(join(tmpDir, "fern", "docs.yml"), [
			{ displayName: "Bare", basepath: "bare" },
		]);

		const result = await readFile(join(tmpDir, "fern", "docs.yml"), "utf8");
		expect(result).not.toContain("subtitle:");
		expect(result).toContain("display-name: Bare");
		expect(result).toContain("href: /bare");
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
			"instances:\n  - url: org.docs.buildwithfern.com/myrepo\n",
			"utf8"
		);
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	it("skips when no wiki provider is configured", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir },
		});

		expect(result.status).toBe("skip");
		expect(result.message).toContain("no wiki provider configured");
	});

	it("skips when no org can be resolved", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir },
			token: "tok",
		});

		expect(result.status).toBe("skip");
		expect(result.message).toContain("no org configured");
	});

	it("skips when no token is available", async () => {
		const loaded = loadedFrom({
			name: "demo",
			org: "theholocron",
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		const origReadToken = process.env.HOLOCRON_READ_TOKEN;
		const origGhToken = process.env.GH_TOKEN;
		const origGithubToken = process.env.GITHUB_TOKEN;
		delete process.env.HOLOCRON_READ_TOKEN;
		delete process.env.GH_TOKEN;
		delete process.env.GITHUB_TOKEN;

		try {
			const result = await runSyncWiki({
				loaded,
				context: { repoRoot: tmpDir },
			});

			expect(result.status).toBe("skip");
			expect(result.message).toContain("no GitHub token");
		} finally {
			if (origReadToken !== undefined) process.env.HOLOCRON_READ_TOKEN = origReadToken;
			if (origGhToken !== undefined) process.env.GH_TOKEN = origGhToken;
			if (origGithubToken !== undefined) process.env.GITHUB_TOKEN = origGithubToken;
		}
	});

	it("returns dry-run when dryRun is true", async () => {
		const loaded = loadedFrom({
			name: "demo",
			org: "theholocron",
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir, dryRun: true },
			token: "tok",
		});

		expect(result.status).toBe("dry-run");
	});

	it("runs discovery, merges products, and returns ok", async () => {
		const loaded = loadedFrom({
			name: "demo",
			org: "theholocron",
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		const fetch = makeOrgFetch([
			{
				name: "alpha",
				full_name: "theholocron/alpha",
				configJson: {
					providers: { wiki: ["fern", { domain: "wiki.example.com/alpha" }] },
				},
			},
			{
				name: "beta",
				full_name: "theholocron/beta",
				configJson: {
					description: "Beta tool",
					providers: { wiki: ["fern", { domain: "wiki.example.com/beta" }] },
				},
			},
		]);

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir },
			token: "tok",
			fetch: fetch as typeof globalThis.fetch,
		});

		expect(result.status).toBe("ok");
		expect(result.message).toContain("2 products");

		const docsContent = await readFile(join(tmpDir, "fern", "docs.yml"), "utf8");
		expect(docsContent).toContain("display-name: Alpha");
		expect(docsContent).toContain("display-name: Beta");
		expect(docsContent).toContain("subtitle: Beta tool");
	});

	it("skips when discovery finds no wiki-enabled repos", async () => {
		const loaded = loadedFrom({
			name: "demo",
			org: "theholocron",
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		const fetch = makeOrgFetch([
			{
				name: "no-wiki",
				full_name: "theholocron/no-wiki",
				configJson: { providers: { source: "github" } },
			},
		]);

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir },
			token: "tok",
			fetch: fetch as typeof globalThis.fetch,
		});

		expect(result.status).toBe("skip");
		expect(result.message).toContain("no wiki-enabled repos found");
	});

	it("returns fail when mergeProducts throws", async () => {
		const loaded = loadedFrom({
			name: "demo",
			org: "theholocron",
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		// Remove the docs.yml so mergeProducts throws
		await rm(join(tmpDir, "fern"), { recursive: true });

		const fetch = makeOrgFetch([
			{
				name: "alpha",
				full_name: "theholocron/alpha",
				configJson: {
					providers: { wiki: ["fern", { domain: "wiki.example.com/alpha" }] },
				},
			},
		]);

		const result = await runSyncWiki({
			loaded,
			context: { repoRoot: tmpDir },
			token: "tok",
			fetch: fetch as typeof globalThis.fetch,
		});

		expect(result.status).toBe("fail");
		expect(result.message).toContain("fern/docs.yml not found");
	});

	it("uses cliToken from context when no explicit token is given", async () => {
		const loaded = loadedFrom({
			name: "demo",
			org: "theholocron",
			providers: { wiki: ["fern", { domain: "wiki.example.com", fernOrg: "org" }] },
		});

		const origReadToken = process.env.HOLOCRON_READ_TOKEN;
		const origGhToken = process.env.GH_TOKEN;
		const origGithubToken = process.env.GITHUB_TOKEN;
		delete process.env.HOLOCRON_READ_TOKEN;
		delete process.env.GH_TOKEN;
		delete process.env.GITHUB_TOKEN;

		try {
			const fetch = makeOrgFetch([
				{
					name: "alpha",
					full_name: "theholocron/alpha",
					configJson: {
						providers: { wiki: ["fern", { domain: "wiki.example.com/alpha" }] },
					},
				},
			]);

			const result = await runSyncWiki({
				loaded,
				context: { repoRoot: tmpDir, cliToken: "ctx-token" },
				fetch: fetch as typeof globalThis.fetch,
			});

			expect(result.status).toBe("ok");
		} finally {
			if (origReadToken !== undefined) process.env.HOLOCRON_READ_TOKEN = origReadToken;
			if (origGhToken !== undefined) process.env.GH_TOKEN = origGhToken;
			if (origGithubToken !== undefined) process.env.GITHUB_TOKEN = origGithubToken;
		}
	});
});
