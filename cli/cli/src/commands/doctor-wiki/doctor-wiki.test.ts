import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import type { PluginLoader, Wiki, WikiInspection } from "../../plugin/index.js";
import { runDoctorWiki } from "./doctor-wiki.js";

const healthy: WikiInspection = {
	organization: { declared: "holocron", found: "holocron" },
	instance: { expectedUrl: "a.docs.example", foundUrl: "a.docs.example" },
	site: [{ url: "a.docs.example", status: 200 }],
	navigation: { listed: 1, missing: [], unlisted: [] },
	published: { url: "a.docs.example/sitemap.xml", status: 200, pages: 1 },
};

async function run(fakes: {
	wiki?: Partial<Wiki> | null;
	loadFailures?: { key: string; provider: string; error: Error }[];
}) {
	const lines: string[] = [];
	const wiki =
		fakes.wiki === null || fakes.wiki === undefined
			? undefined
			: ({ key: "wiki", providerName: "fern", provision: async () => "", ...fakes.wiki } as Wiki);
	const loader = {
		load: async () => undefined,
		loadFailures: () => fakes.loadFailures ?? [],
		loadedKeys: () => (wiki ? ["wiki"] : []),
		has: (key: string) => key === "wiki" && wiki !== undefined,
		get: () => wiki,
	} as unknown as PluginLoader;
	const report = await runDoctorWiki({
		loaded: { resolved: resolveConfig({ name: "demo", org: "acme", providers: {} } as never), filepath: "/tmp/x" },
		context: { repoRoot: "/tmp" },
		loader,
		print: (line) => lines.push(line),
		logger: { info: vi.fn() } as never,
	});
	return { report, text: lines.join("\n") };
}

describe("doctor wiki", () => {
	it("passes when the wiki matches", async () => {
		const { report, text } = await run({ wiki: { inspect: async () => healthy } });
		expect(report.status).toBe("ok");
		expect(report.summary).toEqual({ ok: 5, fail: 0, skip: 0 });
		expect(text).toContain("docs site answers");
	});

	it("fails when a row fails", async () => {
		const { report } = await run({
			wiki: { inspect: async () => ({ ...healthy, site: [{ url: "a.docs.example", status: 404 }] }) },
		});
		expect(report.status).toBe("fail");
	});

	it("skips with a reason when there is no wiki provider", async () => {
		const { report } = await run({ wiki: null });
		expect(report).toMatchObject({ status: "skip", reason: expect.stringContaining("no `wiki` provider") });
	});

	it("names a provider that failed to load", async () => {
		const { report } = await run({
			wiki: null,
			loadFailures: [{ key: "wiki", provider: "fern", error: new Error("boom") }],
		});
		expect(report.reason).toMatch(/`fern` failed to load/);
	});

	it("skips a provider that cannot read its wiki", async () => {
		const { report } = await run({ wiki: {} });
		expect(report).toMatchObject({ status: "skip", reason: "fern cannot read its wiki" });
	});

	it("skips, never fails, when the read throws", async () => {
		const { report } = await run({
			wiki: {
				inspect: async () => {
					throw new Error("disk gone");
				},
			},
		});
		expect(report.status).toBe("skip");
		expect(report.reason).toMatch(/could not read the wiki/);
	});
});
