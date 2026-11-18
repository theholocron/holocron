import { describe, expect, it } from "vitest";

import type { WikiInspection } from "../../plugin/index.js";
import { wikiRows } from "./wiki-rows.js";

const URL = "holocron.docs.buildwithfern.com/holocron";
const DOMAIN = "wiki.example.dev/holocron";

const healthy = (): WikiInspection => ({
	organization: { declared: "holocron", found: "holocron" },
	instance: { expectedUrl: URL, foundUrl: URL, expectedDomain: DOMAIN, foundDomain: DOMAIN },
	site: [
		{ url: URL, status: 200 },
		{ url: DOMAIN, status: 200 },
	],
	navigation: { listed: 3, missing: [], unlisted: [] },
	published: { url: `${DOMAIN}/sitemap.xml`, status: 200, pages: 3 },
});

const byId = (found: WikiInspection) => Object.fromEntries(wikiRows(found, "fern").map((r) => [r.id, r]));

describe("wikiRows", () => {
	it("passes every row for a wiki that matches its config and sources", () => {
		const rows = wikiRows(healthy(), "fern");
		expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
		expect(rows.map((r) => r.id)).toEqual([
			"wiki:organization",
			"wiki:instance",
			"wiki:site",
			"wiki:domain",
			"wiki:navigation",
			"wiki:published",
		]);
	});

	it("fails an organization that is missing or differs", () => {
		const none = healthy();
		none.organization.found = null;
		expect(byId(none)["wiki:organization"]).toMatchObject({ status: "fail" });
		const other = healthy();
		other.organization.found = "acme";
		const row = byId(other)["wiki:organization"]!;
		expect(row.status).toBe("fail");
		expect(row.problems[0]).toMatch(/names acme, the config declares holocron/);
	});

	it("fails a docs file that is missing or points at another instance or domain", () => {
		const none = healthy();
		none.instance = null;
		expect(byId(none)["wiki:instance"]).toMatchObject({ status: "fail" });
		const moved = healthy();
		moved.instance = {
			expectedUrl: URL,
			foundUrl: "x.docs.buildwithfern.com",
			expectedDomain: DOMAIN,
			foundDomain: null,
		};
		const row = byId(moved)["wiki:instance"]!;
		expect(row.problems).toHaveLength(2);
		expect(row.problems.join(" ")).toMatch(/instance url is x\.docs.*custom-domain is not set/);
	});

	it("passes a site that restricts access, fails a 404 and a 5xx, and skips one that gave no answer", () => {
		const f = healthy();
		f.site = [
			{ url: URL, status: 403 },
			{ url: DOMAIN, status: 404 },
		];
		const rows = byId(f);
		expect(rows["wiki:site"]).toMatchObject({ status: "ok" });
		expect(rows["wiki:domain"]).toMatchObject({ status: "fail" });
		expect(rows["wiki:domain"]!.problems[0]).toMatch(/doctor dns/);

		f.site = [
			{ url: URL, status: 404 },
			{ url: DOMAIN, status: 502 },
		];
		const failed = byId(f);
		expect(failed["wiki:site"]!.problems[0]).toMatch(/not published/);
		expect(failed["wiki:domain"]!.problems[0]).toMatch(/502, expected a page/);

		f.site = [{ url: URL, error: "could not be reached" }];
		expect(byId(f)["wiki:site"]).toMatchObject({ status: "skip", detail: `${URL}: could not be reached` });
		expect(byId(f)["wiki:domain"]).toBeUndefined();
	});

	it("names every unlisted page when there are five or fewer", () => {
		const f = healthy();
		f.navigation = { listed: 3, missing: [], unlisted: ["docs/wiki/a.md", "docs/wiki/b.md"] };
		expect(byId(f)["wiki:unlisted"]!.detail).toContain("(docs/wiki/a.md, docs/wiki/b.md)");
	});

	it("lists at most five unlisted pages and says how many more there are", () => {
		const f = healthy();
		const unlisted = Array.from({ length: 7 }, (_, i) => `docs/wiki/p${i}.md`);
		f.navigation = { listed: 3, missing: [], unlisted };
		const detail = byId(f)["wiki:unlisted"]!.detail;
		expect(detail).toContain(
			"docs/wiki/p0.md, docs/wiki/p1.md, docs/wiki/p2.md, docs/wiki/p3.md, docs/wiki/p4.md and 2 more"
		);
		expect(detail).not.toContain("p5.md");
	});

	it("fails a listed page that is not on disk and says nothing of unlisted ones then", () => {
		const f = healthy();
		f.navigation = { listed: 3, missing: ["docs/wiki/a.md"], unlisted: ["docs/wiki/b.md"] };
		const rows = byId(f);
		expect(rows["wiki:navigation"]).toMatchObject({ status: "fail", detail: "1 missing" });
		expect(rows["wiki:unlisted"]).toBeUndefined();
	});

	it("reports unlisted pages as information that counts as skipped, and caps the names", () => {
		const f = healthy();
		f.navigation = {
			listed: 3,
			missing: [],
			unlisted: Array.from({ length: 7 }, (_, i) => `docs/wiki/p${i}.md`),
		};
		const row = byId(f)["wiki:unlisted"]!;
		expect(row.status).toBe("skip");
		expect(row.detail).toMatch(/^info: 7 not in the navigation/);
		expect(row.detail).toContain("and 2 more");
		expect(row.detail).not.toContain("p6");
	});

	it("skips the navigation when there is no docs file", () => {
		const f = healthy();
		f.navigation = null;
		expect(byId(f)["wiki:navigation"]).toMatchObject({ status: "skip" });
	});

	it("fails when the published index lists fewer pages than the navigation", () => {
		const f = healthy();
		f.published = { url: `${DOMAIN}/sitemap.xml`, status: 200, pages: 1 };
		const row = byId(f)["wiki:published"]!;
		expect(row).toMatchObject({ status: "fail", detail: "1 of 3" });
		expect(row.problems[0]).toMatch(/lists 1 page\(s\), the navigation lists 3/);
	});

	it("skips the published pages when the index was not served or not asked", () => {
		const f = healthy();
		f.published = { url: "x/sitemap.xml", status: 404 };
		expect(byId(f)["wiki:published"]).toMatchObject({ status: "skip", detail: "x/sitemap.xml: answered 404" });
		f.published = { url: "x/sitemap.xml", error: "could not be reached" };
		expect(byId(f)["wiki:published"]!.detail).toMatch(/could not be reached/);
		f.published = { url: "x/sitemap.xml" };
		expect(byId(f)["wiki:published"]!.detail).toMatch(/no answer/);
		f.published = null;
		expect(byId(f)["wiki:published"]).toMatchObject({ status: "skip" });
	});

	it("passes the published count without a navigation to compare", () => {
		const f = healthy();
		f.navigation = null;
		expect(byId(f)["wiki:published"]).toMatchObject({ status: "ok" });
	});

	it("says no answer when a probe has neither a status nor a reason", () => {
		const f = healthy();
		f.site = [{ url: URL }];
		expect(byId(f)["wiki:site"]).toMatchObject({ status: "skip", detail: `${URL}: no answer` });
	});

	it("names an instance url that is not set, and prints no site row when none was asked", () => {
		const f = healthy();
		f.instance = { expectedUrl: URL, foundUrl: null };
		f.site = [];
		const rows = byId(f);
		expect(rows["wiki:instance"]!.problems[0]).toMatch(/instance url is not set/);
		expect(rows["wiki:site"]).toBeUndefined();
	});
});
