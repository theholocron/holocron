import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { runBackfill } from "./backfill.js";
import { fakeApi, fakeCtx, item, lines } from "./backfill.testing.js";
import type { BackfillApi, BackfillItem, BackfillOptions, LabelsConfig } from "./issue-types.type.js";
import { resolveKinds } from "./kinds.js";

const AREAS: LabelsConfig = {
	areas: { cli: ["cli/**"], plugins: ["plugins/**"], sentinel: ["apps/sentinel/**"] },
	scopes: { cli: "cli", sentinel: "sentinel" },
};
const OPTIONS: BackfillOptions = { after: 0, limit: 100, pullRequests: false, repos: [] };
const KINDS = resolveKinds({});
const rateLimit = () => new ProviderApiError("API rate limit exceeded", 429);
const isRateLimited = (e: unknown) => e instanceof ProviderApiError && e.status === 429;

async function run(
	items: BackfillItem[],
	over: Partial<BackfillApi> = {},
	options: Partial<BackfillOptions> = {},
	dryRun = false
) {
	const { api, writes } = fakeApi(over, { items });
	const { ctx, rows, wrote } = fakeCtx(dryRun);
	await runBackfill({ ctx, api, options: { ...OPTIONS, ...options }, areas: AREAS, kinds: KINDS, isRateLimited });
	return { writes, rows, wrote, text: lines(rows) };
}

describe("runBackfill", () => {
	it("sets the Type from a kind label and adds the area of the title's scope, keeping every label", async () => {
		const { writes, text } = await run([
			item(1, { title: "fix(sentinel): crash", labels: ["bug", "released"] }),
			item(2, { title: "feat(cli): thing", labels: ["enhancement"] }),
			item(3, { title: "chore: tidy", labels: ["chore"] }),
		]);
		expect(writes).toEqual([
			"labels 1 area:sentinel",
			"type 1 Bug",
			"labels 2 area:cli",
			"type 2 Feature",
			"type 3 Task",
		]);
		expect(text).toContain(
			"info Type: Bug 1, Feature 1, Task 1 set; 0 already typed, 0 with no label that maps to a Type, 0 with two kind labels"
		);
		expect(text).toContain("info area labels: added to 2 items");
	});

	it("says `would` and writes nothing on a dry run, and counts the same", async () => {
		const { writes, wrote, text } = await run([item(1, { labels: ["bug"], title: "fix(cli): x" })], {}, {}, true);
		expect(writes).toEqual([]);
		expect(wrote).toEqual(["would add area:cli to #1", "would set Type Bug on #1"]);
		expect(text.some((l) => l.startsWith("info Type: Bug 1 would be set"))).toBe(true);
		expect(text.some((l) => l.includes("after the changes above"))).toBe(true);
	});

	it("never overwrites: a Type, a milestone, an area label or a project that is there stays", async () => {
		const { writes, text } = await run(
			[
				item(1, {
					title: "fix(cli): x",
					labels: ["bug", "AREA:CLI"],
					type: "Task",
					milestone: { number: 3, title: "v4.0" },
				}),
			],
			{ projectsOf: async () => new Map([["N1", ["OTHER"]]]) },
			{ since: "2026-01-01", milestone: "v5.0", project: "v5" }
		);
		expect(writes).toEqual([]);
		expect(text).toContain(
			"info Type: none set; 1 already typed, 0 with no label that maps to a Type, 0 with two kind labels"
		);
	});

	it("leaves an issue with two kind labels, and one with none, for a person and says so", async () => {
		const { writes, text } = await run([
			item(1, { labels: ["bug", "enhancement"] }),
			item(2, { labels: ["released"] }),
		]);
		expect(writes).toEqual([]);
		expect(text).toContain("info #1: has bug and enhancement: left for a person to choose");
		expect(text).toContain(
			"info Type: none set; 0 already typed, 1 with no label that maps to a Type, 1 with two kind labels"
		);
	});

	it("gives an issue with only another kind label the Type Task", async () => {
		const { writes, text } = await run([item(1, { labels: ["ci"] })]);
		expect(writes).not.toEqual([]);
		expect(text).toContain(
			"info Type: Task 1 set; 0 already typed, 0 with no label that maps to a Type, 0 with two kind labels"
		);
	});

	it("fails naming a Type the organization lacks, with its labels, and writes nothing", async () => {
		const { writes, text } = await run([item(1, { labels: ["bug"] })], { typeNames: async () => new Set(["Bug"]) });
		expect(writes).toEqual([]);
		expect(text).toEqual([
			"fail Type: Feature (for enhancement) is not an issue Type of this organization; its Types are Bug",
			"fail Type: Task (for chore, ci, documentation, refactor, test, performance, dependencies) is not an issue Type of this organization; its Types are Bug",
		]);
	});

	it("says the organization has no Types when it lists none", async () => {
		const { text } = await run([], { typeNames: async () => new Set() });
		expect(text[0]).toMatch(/its Types are none$/);
	});

	it("names the repository in the resume command when the run is for one", async () => {
		const many = Array.from({ length: 3 }, (_, i) => item(i + 1));
		const { text } = await run(many, {}, { limit: 2, repo: "acme/other" });
		expect(text.join("\n")).toContain("--after 2 --limit 2 --repo acme/other");
	});

	it("takes the milestone of the parent first, then --milestone, and the project only from --project", async () => {
		const { writes, text } = await run(
			[item(1), item(2), item(3, { milestone: { number: 9, title: "v9" } })],
			{
				parent: async (n) =>
					n === 1 ? { number: 50, milestone: 4 } : n === 2 ? { number: 51, milestone: null } : null,
			},
			{ since: "2026-01-01", milestone: "v5.0", project: "v5" }
		);
		expect(writes).toEqual(["milestone 1 4", "project P1 N1", "milestone 2 7", "project P1 N2", "project P1 N3"]);
		expect(text).toContain("info milestone: set on 2 (1 from a parent, 1 from --milestone)");
		expect(text).toContain("info project: 3 issues added from --project");
	});

	it("takes no milestone or project it has no source for, and lists those issues", async () => {
		const { writes, text } = await run(
			[
				item(1, { title: "orphan" }),
				item(2, { state: "closed", title: "other", milestone: { number: 1, title: "x" } }),
			],
			{ parent: async () => ({ number: 9, milestone: null }), projectsOf: async () => new Map([["N2", ["P9"]]]) }
		);
		expect(writes).toEqual([]);
		expect(text).toContain("info without a project: 1 of 2 items read");
		expect(text).toContain("info without a milestone: 1 of 2 items read");
		expect(text).toContain("info #1: open: orphan");
	});

	it("lists what lacks a Priority or an Effort, and says ok for an empty list", async () => {
		const { text } = await run(
			[item(1), item(2)],
			{
				fieldValues: async (n) => new Set(n === 1 ? ["priority", "effort"] : ["priority"]),
				projectsOf: async () =>
					new Map([
						["N1", ["P"]],
						["N2", ["P"]],
					]),
			},
			{ since: "2026-01-01", milestone: "v5.0" }
		);
		expect(text).toContain("info without a Priority: 0 of 2 items read");
		expect(text).toContain("info without an Effort: 1 of 2 items read");
		expect(text).toContain("info without a project: 0 of 2 items read");
	});

	it("covers only the issue fields the organization has, and says when it cannot read them", async () => {
		const only = await run([item(1)], {
			fieldNames: async () => new Set(["priority"]),
			fieldValues: async () => new Set(),
		});
		expect(only.text.some((l) => l.includes("without an Effort"))).toBe(false);
		expect(only.text).toContain("info without a Priority: 1 of 1 item read");
		const unreadable = await run([item(1)], { fieldNames: async () => "GitHub refused: 403" });
		expect(unreadable.text).toContain(
			"fail Priority, Effort: NOT checked, so the lists below are incomplete: the token (github.issues) was refused reading the organization issue fields (GitHub refused: 403)"
		);
		expect(unreadable.text.some((l) => l.includes("without a Priority"))).toBe(false);
	});

	it("adds an area label to a pull request from its changed files, and no Type or milestone", async () => {
		const { writes, text } = await run(
			[item(8, { isPullRequest: true, labels: ["bug"] }), item(9, { isPullRequest: true, labels: ["area:cli"] })],
			{ files: async () => ["cli/cli/src/a.ts", "plugins/x/y.ts"] },
			{ pullRequests: true }
		);
		expect(writes).toEqual(["labels 8 area:cli,area:plugins", "labels 9 area:plugins"]);
		expect(text.some((l) => l.startsWith("info Type:"))).toBe(true);
	});

	it("gives a pull request with no changed file no area", async () => {
		const { writes } = await run([item(8, { isPullRequest: true })], {}, { pullRequests: true });
		expect(writes).toEqual([]);
	});

	it("says which area labels the repository lacks and does not add them", async () => {
		const { writes, text } = await run([item(1, { title: "fix(sentinel): x" })], {
			labelNames: async () => new Set(),
		});
		expect(writes).toEqual([]);
		expect(text).toContain(
			"info area:sentinel: wanted but the repository has no such label: run `holocron setup` first"
		);
	});

	it("fails and stops when --milestone or --project is not there", async () => {
		const noMilestone = await run(
			[item(1)],
			{ milestoneNumber: async () => undefined },
			{ since: "2026-01-01", milestone: "v9" }
		);
		expect(noMilestone.text).toEqual(["fail milestone: v9 is not a milestone of this repository"]);
		const noProject = await run(
			[item(1)],
			{ projectId: async () => undefined },
			{ since: "2026-01-01", project: "v9" }
		);
		expect(noProject.text).toEqual(["fail project: v9 is not a project of this organization"]);
	});

	it("goes on after a failed issue, with a row for it", async () => {
		const typed: number[] = [];
		const { text } = await run([item(1, { labels: ["bug"] }), item(2, { labels: ["bug"] })], {
			setType: async (n) => {
				if (n === 1) throw new ProviderApiError("Validation Failed", 422);
				typed.push(n);
			},
		});
		expect(text).toContain("fail #1: Validation Failed");
		expect(typed).toEqual([2]);
		expect(text.find((l) => l.startsWith("info summary"))).toBe(
			"info summary: read 2 items; changed 1; passed over 0 pull requests; 1 failure; the window is finished"
		);
	});

	it("stops cleanly on a rate limit and prints the cursor to resume from", async () => {
		const { text } = await run(
			[item(1, { labels: ["bug"] }), item(2, { labels: ["bug"] })],
			{
				setType: async (n) => {
					if (n === 2) throw rateLimit();
				},
			},
			{ since: "2026-01-01", milestone: "v5.0", project: "v5", limit: 50, pullRequests: true }
		);
		expect(text.find((l) => l.startsWith("info resume"))).toBe(
			"info resume: GitHub's rate limit stopped the run; to continue: holocron probe github issue-types -- --after 1 --since 2026-01-01 --limit 50 --milestone v5.0 --project v5 --pull-requests"
		);
	});

	it("says so when the rate limit comes before the first issue is done", async () => {
		const { text } = await run([item(1, { labels: ["bug"] })], {
			setType: async () => {
				throw rateLimit();
			},
		});
		expect(text.find((l) => l.startsWith("info resume"))).toContain("before it finished one item");
	});

	it("stops on a rate limit while it reads the projects, and on one while it reads the issues", async () => {
		const projects = await run([item(1)], {
			projectsOf: async () => {
				throw rateLimit();
			},
		});
		expect(projects.text.find((l) => l.startsWith("info resume"))).toContain("before it finished one item");
		const reading = await run([], {
			list: async () => {
				throw rateLimit();
			},
		});
		expect(reading.text.find((l) => l.startsWith("info resume"))).toContain("before it finished one item");
	});

	it("throws a failure it cannot tell apart from a rate limit while reading projects", async () => {
		const { api } = fakeApi(
			{
				projectsOf: async () => {
					throw new Error("boom");
				},
			},
			{ items: [item(1)] }
		);
		const { ctx } = fakeCtx();
		await expect(
			runBackfill({ ctx, api, options: OPTIONS, areas: AREAS, kinds: KINDS, isRateLimited })
		).rejects.toThrow("boom");
	});

	it("reads the projects of a long list 100 at a time", async () => {
		const asked: number[] = [];
		const many = Array.from({ length: 150 }, (_, i) => item(i + 1));
		await run(
			many,
			{
				projectsOf: async (ids) => {
					asked.push(ids.length);
					return new Map();
				},
				list: async (page) => many.slice((page - 1) * 100, page * 100),
			},
			{ limit: 150 }
		);
		expect(asked).toEqual([100, 50]);
	});

	it("says the window is finished, and the pull requests it passed over", async () => {
		const { text } = await run([item(1), item(2, { isPullRequest: true })]);
		expect(text).toContain("info resume: the window is finished");
		expect(text).toContain(
			"info summary: read 1 item; changed 0; passed over 1 pull request (give --pull-requests to include them); 0 failures; the window is finished"
		);
	});

	it("says the limit was reached with the cursor, naming --issues when it was used", async () => {
		const { text } = await run([item(1), item(2), item(3)], {}, { limit: 2, issues: [1, 2, 3] });
		expect(text.find((l) => l.startsWith("info resume"))).toBe(
			"info resume: the limit was reached; to continue: holocron probe github issue-types -- --after 2 --issues 1,2,3 --limit 2"
		);
	});

	it("counts the pull requests it read, and the items it changed, in the summary", async () => {
		const { text } = await run(
			[item(1, { labels: ["bug"] }), item(2, { isPullRequest: true })],
			{},
			{ pullRequests: true }
		);
		expect(text).toContain(
			"info summary: read 2 items (1 pull request); changed 1; passed over 0 pull requests; 0 failures; the window is finished"
		);
	});

	it("says in the summary that the limit stopped it, and that the rate limit did", async () => {
		const limit = await run([item(1), item(2)], {}, { limit: 1 });
		expect(limit.text).toContain(
			"info summary: read 1 item; changed 0; passed over 0 pull requests; 0 failures; stopped at the limit of 1, more remain"
		);
		const rate = await run([item(1, { labels: ["bug"] }), item(2, { labels: ["bug"] })], {
			setType: async (n) => {
				if (n === 2) throw rateLimit();
			},
		});
		expect(rate.text.find((l) => l.startsWith("info summary"))).toContain(
			"stopped by GitHub's rate limit, more remain"
		);
	});
});
