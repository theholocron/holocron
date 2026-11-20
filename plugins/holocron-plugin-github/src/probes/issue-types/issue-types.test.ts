import { describe, expect, it } from "vitest";

import { fakeApi, fakeCtx, item, lines } from "./backfill.testing.js";
import { issueTypesProbe } from "./issue-types.js";

const areas = { areas: { cli: ["cli/**"] }, scopes: { cli: "cli" } };

describe("the issue-types probe", () => {
	it("is a writer, which the runner asks about first and runs under --dry-run", () => {
		const probe = issueTypesProbe({ makeApi: () => fakeApi().api, areas });
		expect(probe.writes).toBe(true);
		expect(probe.summary).toMatch(/Run with --dry-run first/);
	});

	it("backfills through the context's writes", async () => {
		const { api, writes } = fakeApi({}, { items: [item(1, { labels: ["bug"], title: "fix(cli): x" })] });
		const { ctx, rows } = fakeCtx(false, ["--limit", "5"]);
		await issueTypesProbe({ makeApi: () => api, areas }).run(ctx);
		expect(writes).toEqual(["labels 1 area:cli", "type 1 Bug"]);
		expect(lines(rows)).toContain("info resume: the window is finished");
	});

	it("says what is wrong with the arguments and does nothing", async () => {
		const { ctx, rows } = fakeCtx(false, ["--limit", "0"]);
		await issueTypesProbe({
			makeApi: () => {
				throw new Error("should not be built");
			},
			areas,
		}).run(ctx);
		expect(lines(rows)).toEqual(["fail arguments: --limit takes a whole number of at least 1, not 0"]);
	});

	it("runs with no arguments at all", async () => {
		const { api } = fakeApi();
		const { ctx, rows } = fakeCtx();
		delete (ctx as { args?: unknown }).args;
		await issueTypesProbe({ makeApi: () => api, areas }).run(ctx);
		expect(lines(rows)).toContain("info resume: the window is finished");
	});

	it("turns a missing token or a failed read into a failing row", async () => {
		const { ctx, rows } = fakeCtx();
		await issueTypesProbe({
			makeApi: () => {
				throw new Error("no github.issues token is configured");
			},
			areas,
		}).run(ctx);
		expect(lines(rows)).toEqual(["fail issue-types: no github.issues token is configured"]);
	});
});
