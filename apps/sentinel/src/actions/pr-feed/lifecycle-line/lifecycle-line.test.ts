import { describe, expect, it } from "vitest";

import type { PullRequestSnapshot } from "../read-pull-request-state/index.js";
import { lastLifecycleKind, renderLifecycleLine } from "./lifecycle-line.js";

function snapshot(over: Partial<PullRequestSnapshot["state"]> = {}, rest: Partial<PullRequestSnapshot> = {}) {
	return {
		state: {
			repo: "acme/widgets",
			number: 7,
			title: "t",
			url: "u",
			author: "luke",
			authorIsBot: false,
			draft: false,
			merged: false,
			closed: false,
			createdAt: "2026-11-05T12:00:00Z",
			base: "alpha",
			requestedReviewers: [],
			review: "none",
			ci: "none",
			mergeable: "clean",
			...over,
		},
		headSha: "abc",
		diff: { additions: 10, deletions: 2, changedFiles: 3 },
		checkRuns: [],
		...rest,
	} as PullRequestSnapshot;
}

describe("renderLifecycleLine", () => {
	it("says who opened it, into what, and how big it is", () => {
		expect(renderLifecycleLine("opened", snapshot())).toBe(
			"🆕 Opened by luke into `alpha`: +10 −2 in 3 files\n-# pr: opened"
		);
	});

	it("marks a bot and a one-file diff", () => {
		const line = renderLifecycleLine(
			"opened",
			snapshot(
				{ author: "dependabot[bot]", authorIsBot: true },
				{ diff: { additions: 1, deletions: 0, changedFiles: 1 } }
			)
		);
		expect(line).toContain("dependabot[bot] (bot)");
		expect(line).toContain("in 1 file\n");
	});

	it("says reopened", () => {
		expect(renderLifecycleLine("reopened", snapshot())).toBe("🔄 Reopened\n-# pr: reopened");
	});

	it("says who merged it, or just merged, or closed without merging", () => {
		expect(renderLifecycleLine("closed", snapshot({ merged: true, closed: true }, { mergedBy: "han" }))).toBe(
			"🟣 Merged by han\n-# pr: closed"
		);
		expect(renderLifecycleLine("closed", snapshot({ merged: true, closed: true }))).toBe(
			"🟣 Merged\n-# pr: closed"
		);
		expect(renderLifecycleLine("closed", snapshot({ closed: true }))).toBe(
			"⚪ Closed without merging\n-# pr: closed"
		);
	});
});

describe("lastLifecycleKind", () => {
	it("is the newest lifecycle marker, skipping other messages", () => {
		expect(
			lastLifecycleKind(["✅ CI passed\n-# ci: abc success", "🔄 Reopened\n-# pr: reopened", "x\n-# pr: opened"])
		).toBe("reopened");
	});

	it("is undefined when there is none", () => {
		expect(lastLifecycleKind(["hello", "summary\n-# sync: a/b#1 | waiting"])).toBeUndefined();
		expect(lastLifecycleKind([])).toBeUndefined();
	});
});
