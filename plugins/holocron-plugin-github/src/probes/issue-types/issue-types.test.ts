import { describe, expect, it } from "vitest";

import { fakeApi, fakeCtx, item, lines } from "./backfill.testing.js";
import { issueTypesProbe } from "./issue-types.js";

const config = { areas: { cli: ["cli/**"] }, scopes: { cli: "cli" } };
const REPO = "acme/widgets";

describe("the issue-types probe", () => {
	it("is a writer, which the runner asks about first and runs under --dry-run", () => {
		const probe = issueTypesProbe({ makeApi: () => fakeApi().api, config, repo: REPO });
		expect(probe.writes).toBe(true);
		expect(probe.summary).toMatch(/Run with --dry-run first/);
	});

	it("backfills through the context's writes", async () => {
		const { api, writes } = fakeApi({}, { items: [item(1, { labels: ["bug"], title: "fix(cli): x" })] });
		const { ctx, rows } = fakeCtx(false, ["--limit", "5"]);
		await issueTypesProbe({ makeApi: () => api, config, repo: REPO }).run(ctx);
		expect(writes).toEqual(["labels 1 area:cli", "type 1 Bug"]);
		expect(lines(rows)).toContain("info resume: the window is finished");
	});

	it("says what is wrong with the arguments and does nothing", async () => {
		const { ctx, rows } = fakeCtx(false, ["--limit", "0"]);
		await issueTypesProbe({
			makeApi: () => {
				throw new Error("should not be built");
			},
			config,
			repo: REPO,
		}).run(ctx);
		expect(lines(rows)).toEqual(["fail arguments: --limit takes a whole number of at least 1, not 0"]);
	});

	it("runs with no arguments at all", async () => {
		const { api } = fakeApi();
		const { ctx, rows } = fakeCtx();
		delete (ctx as { args?: unknown }).args;
		await issueTypesProbe({ makeApi: () => api, config, repo: REPO }).run(ctx);
		expect(lines(rows)).toContain("info resume: the window is finished");
	});

	it("turns a missing token or a failed read into a failing row", async () => {
		const { ctx, rows } = fakeCtx();
		await issueTypesProbe({
			makeApi: () => {
				throw new Error("no github.issues token is configured");
			},
			config,
			repo: REPO,
		}).run(ctx);
		expect(lines(rows)).toEqual(["fail issue-types: no github.issues token is configured"]);
	});

	describe("repositories", () => {
		const labelled = { ...config, repos: undefined };
		const built: string[] = [];
		const apis: Record<string, ReturnType<typeof fakeApi>> = {};
		const makeApi = (repo: string) => {
			built.push(repo);
			return (apis[repo] ??= fakeApi({}, { items: [item(1, { labels: ["bug"], title: "fix(cli): x" })] })).api;
		};
		const reset = () => {
			built.length = 0;
			for (const key of Object.keys(apis)) delete apis[key];
		};

		it("works on this repository alone, with no heading, when nothing names others", async () => {
			reset();
			const { ctx, rows } = fakeCtx(false, []);
			await issueTypesProbe({ makeApi, config: labelled, repo: REPO }).run(ctx);
			expect(built).toEqual([REPO]);
			expect(lines(rows).includes(`heading ${REPO}`)).toBe(false);
			expect(apis[REPO].writes).toEqual(["labels 1 area:cli", "type 1 Bug"]);
			expect(lines(rows).join("\n")).not.toContain("--repo");
		});

		it("works on the configured list, each under a heading, and reads another repository's areas", async () => {
			reset();
			const other = "acme/other";
			const files: Record<string, string> = {
				[`${other}:.holocron/repo.json`]: JSON.stringify({
					labels: { areas: { web: ["web/**"] }, scopes: { cli: "web" } },
				}),
			};
			const via = (repo: string) => {
				const api = makeApi(repo);
				return { ...api, readFile: async (path: string) => files[`${repo}:${path}`] ?? null };
			};
			const { ctx, rows } = fakeCtx(false, []);
			await issueTypesProbe({
				makeApi: via,
				config: { ...config, repos: [REPO, "ACME/Widgets", other] },
				repo: REPO,
			}).run(ctx);
			const text = lines(rows);
			expect(text.filter((l) => l.includes("/") && l.startsWith("heading"))).toEqual([
				`heading ${REPO}`,
				"heading ACME/Widgets",
				`heading ${other}`,
			]);
			expect(text).toContain("info area labels: read from .holocron/repo.json");
			expect(apis[REPO].writes).toEqual(["labels 1 area:cli", "type 1 Bug"]);
			expect(apis[other].writes).toEqual(["type 1 Bug"]);
		});

		it("lets --repo win over the configured list, names the repository in a resume command and skips areas it cannot read", async () => {
			reset();
			const many = Array.from({ length: 3 }, (_, i) => item(i + 1, { labels: ["bug"] }));
			const factory = (repo: string) => {
				built.push(repo);
				return fakeApi({}, { items: many }).api;
			};
			const { ctx, rows } = fakeCtx(false, ["--repo", "acme/other", "--limit", "2"]);
			await issueTypesProbe({ makeApi: factory, config: { ...config, repos: [REPO] }, repo: REPO }).run(ctx);
			expect(built).toEqual(["acme/other"]);
			const text = lines(rows).join("\n");
			expect(text).toContain("info area labels: skipped: it has no .holocron/repo.json or .holocron/repo.ts");
			expect(text).toContain("--after 2 --limit 2 --repo acme/other");
		});

		it("goes on to the next repository after one fails", async () => {
			reset();
			const factory = (repo: string) => {
				if (repo === "acme/a") throw new Error("no github.issues token is configured");
				return fakeApi().api;
			};
			const { ctx, rows } = fakeCtx(false, ["--repo", "acme/a", "--repo", "acme/b"]);
			await issueTypesProbe({ makeApi: factory, config, repo: REPO }).run(ctx);
			const text = lines(rows);
			expect(text).toContain("fail issue-types: no github.issues token is configured");
			expect(text).toContain("heading acme/b");
			expect(text).toContain("info resume: the window is finished");
		});

		it("uses the kind tables of the config", async () => {
			reset();
			const { ctx } = fakeCtx(false, []);
			const api = fakeApi(
				{ typeNames: async () => new Set(["Defect"]) },
				{ items: [item(1, { labels: ["oops"] })] }
			);
			await issueTypesProbe({
				makeApi: () => api.api,
				config: { kinds: { oops: "Defect" }, fallbackKinds: {} },
				repo: REPO,
			}).run(ctx);
			expect(api.writes).toEqual(["type 1 Defect"]);
		});
	});
});
