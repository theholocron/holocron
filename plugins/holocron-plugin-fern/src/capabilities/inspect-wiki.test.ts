import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inspectWiki } from "./inspect-wiki.js";
import { expectedInstance, FernWiki } from "./wiki.js";

let root: string;

const DOCS = [
	"instances:",
	"  - url: holocron.docs.buildwithfern.com/holocron",
	"    custom-domain: wiki.example.dev/holocron",
	"    multi-source: true",
	"",
	"navigation:",
	"  - tab: decisions",
	"    layout:",
	"      - section: ADRs",
	"        contents:",
	"          - page: Index",
	"            path: ../docs/wiki/decisions/README.md",
	"          - page: Gone",
	"            path: ../docs/wiki/decisions/gone.md",
	"",
].join("\n");

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "fern-inspect-"));
	await mkdir(join(root, "fern"), { recursive: true });
	await mkdir(join(root, "docs", "wiki", "decisions"), { recursive: true });
	await writeFile(join(root, "fern", "fern.config.json"), JSON.stringify({ organization: "holocron" }));
	await writeFile(join(root, "fern", "docs.yml"), DOCS);
	await writeFile(join(root, "docs", "wiki", "decisions", "README.md"), "# Index\n");
	await writeFile(join(root, "docs", "wiki", "decisions", "0001-new.md"), "# New\n");
});

afterEach(() => rm(root, { recursive: true, force: true }));

const answering =
	(sitemap = "<urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>"): typeof fetch =>
	async (input) =>
		String(input).endsWith("sitemap.xml")
			? new Response(sitemap, { status: 200 })
			: new Response("", { status: 200 });

const input = {
	repoRoot: "",
	fernOrg: "holocron",
	expectedUrl: "holocron.docs.buildwithfern.com/holocron",
	expectedDomain: "wiki.example.dev/holocron",
};

describe("inspectWiki", () => {
	it("reads the organization, the instance, the navigation and the live site", async () => {
		const found = await inspectWiki({ ...input, repoRoot: root, fetch: answering() });
		expect(found.organization).toEqual({ declared: "holocron", found: "holocron" });
		expect(found.instance).toEqual({
			expectedUrl: input.expectedUrl,
			foundUrl: "holocron.docs.buildwithfern.com/holocron",
			expectedDomain: input.expectedDomain,
			foundDomain: "wiki.example.dev/holocron",
		});
		expect(found.navigation).toEqual({
			listed: 2,
			missing: ["docs/wiki/decisions/gone.md"],
			unlisted: ["docs/wiki/decisions/0001-new.md"],
		});
		expect(found.site).toEqual([
			{ url: input.expectedUrl, status: 200 },
			{ url: input.expectedDomain, status: 200 },
		]);
		expect(found.published).toEqual({ url: "wiki.example.dev/holocron/sitemap.xml", status: 200, pages: 2 });
	});

	it("reports files that are missing or unreadable instead of throwing", async () => {
		await rm(join(root, "fern"), { recursive: true });
		const found = await inspectWiki({ ...input, repoRoot: root, fetch: answering() });
		expect(found.organization.found).toBeNull();
		expect(found.instance).toBeNull();
		expect(found.navigation).toBeNull();
	});

	it("reads an organization file that is not JSON as no organization", async () => {
		await writeFile(join(root, "fern", "fern.config.json"), "{ nope");
		expect((await inspectWiki({ ...input, repoRoot: root, fetch: answering() })).organization.found).toBeNull();
	});

	it("records a refused connection and a timeout without a body or a stack", async () => {
		const refused = await inspectWiki({
			...input,
			repoRoot: root,
			fetch: async () => {
				throw new TypeError("fetch failed: secret-host");
			},
		});
		expect(refused.site[0]).toEqual({ url: input.expectedUrl, error: "could not be reached" });
		expect(refused.published?.pages).toBeUndefined();

		const slow = await inspectWiki({
			...input,
			repoRoot: root,
			fetch: async () => {
				throw Object.assign(new Error("t"), { name: "TimeoutError" });
			},
		});
		expect(slow.site[0]?.error).toMatch(/no answer within/);
	});

	it("leaves out the page count when the sitemap does not answer 200", async () => {
		const found = await inspectWiki({
			...input,
			repoRoot: root,
			fetch: async () => new Response("", { status: 404 }),
		});
		expect(found.published).toEqual({ url: "wiki.example.dev/holocron/sitemap.xml", status: 404 });
	});

	it("asks only the instance when no custom domain is declared", async () => {
		const found = await inspectWiki({
			repoRoot: root,
			fernOrg: "holocron",
			expectedUrl: input.expectedUrl,
			fetch: answering(),
		});
		expect(found.site).toHaveLength(1);
		expect(found.instance).not.toHaveProperty("expectedDomain");
	});
});

describe("inspectWiki without sources", () => {
	it("lists no unlisted pages when docs/wiki does not exist", async () => {
		await rm(join(root, "docs"), { recursive: true });
		const found = await inspectWiki({ ...input, repoRoot: root, fetch: answering() });
		expect(found.navigation).toMatchObject({ unlisted: [] });
	});
});

describe("FernWiki.inspect", () => {
	it("expects the instance and domain provision() writes", async () => {
		const wiki = new FernWiki(
			{ repoRoot: root, repo: "acme/holocron", domain: "wiki.example.dev", fernOrg: "holocron" },
			{ fetch: answering() }
		);
		const found = await wiki.inspect();
		expect(found.instance).toMatchObject({
			expectedUrl: "holocron.docs.buildwithfern.com/holocron",
			expectedDomain: "wiki.example.dev/holocron",
		});
	});

	it("falls back to the org and to no domain", async () => {
		const found = await new FernWiki({ repoRoot: root, org: "acme" }, { fetch: answering() }).inspect();
		expect(found.organization.declared).toBe("acme");
		expect(found.site).toHaveLength(1);
	});
});

describe("inspectWiki edge cases", () => {
	it("reads an instances block with no url, and an unquoted or quoted value", async () => {
		await writeFile(join(root, "fern", "docs.yml"), "instances:\n  - custom-domain: '\"x.dev/a\"'\n");
		const found = await inspectWiki({ ...input, repoRoot: root, fetch: answering() });
		expect(found.instance?.foundUrl).toBeNull();
	});

	it("counts only Markdown files as sources", async () => {
		await writeFile(join(root, "docs", "wiki", "decisions", "logo.png"), "x");
		await writeFile(join(root, "docs", "wiki", "decisions", "page.mdx"), "# mdx\n");
		const found = await inspectWiki({ ...input, repoRoot: root, fetch: answering() });
		expect(found.navigation?.unlisted).toEqual(["docs/wiki/decisions/0001-new.md", "docs/wiki/decisions/page.mdx"]);
	});

	it("counts zero pages in a sitemap with no entries", async () => {
		const found = await inspectWiki({ ...input, repoRoot: root, fetch: answering("<urlset/>") });
		expect(found.published?.pages).toBe(0);
	});

	it("uses the global fetch when none is given", async () => {
		const spy = vi.fn(async () => new Response("", { status: 200 }));
		vi.stubGlobal("fetch", spy);
		try {
			const found = await inspectWiki({ ...input, repoRoot: root });
			expect(found.site[0]).toEqual({ url: input.expectedUrl, status: 200 });
			expect(spy).toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("expectedInstance", () => {
	it("uses a domain's own basepath as it is", () => {
		expect(expectedInstance({ fernOrg: "o", domain: "wiki.dev/base", repoName: "r" })).toEqual({
			instanceUrl: "o.docs.buildwithfern.com/base",
			customDomain: "wiki.dev/base",
			multiSource: true,
		});
	});

	it("uses a bare domain as it is when there is no repo to name a basepath", () => {
		expect(expectedInstance({ fernOrg: "o", domain: "wiki.dev" })).toEqual({
			instanceUrl: "o.docs.buildwithfern.com",
			customDomain: "wiki.dev",
			multiSource: false,
		});
	});

	it("has no custom domain when none is declared", () => {
		expect(expectedInstance({ fernOrg: "o" })).toEqual({
			instanceUrl: "o.docs.buildwithfern.com",
			customDomain: undefined,
			multiSource: false,
		});
	});
});

describe("FernWiki.inspect defaults", () => {
	it("reads from the working directory and the global fetch when the loader gave neither", async () => {
		const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
		const spy = vi.fn(async () => new Response("", { status: 200 }));
		vi.stubGlobal("fetch", spy);
		try {
			const found = await new FernWiki({}).inspect();
			expect(found.organization).toEqual({ declared: "holocron", found: "holocron" });
		} finally {
			cwd.mockRestore();
			vi.unstubAllGlobals();
		}
	});
});
