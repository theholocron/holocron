import { describe, expect, it } from "vitest";

import { tallyDropped } from "./tally-dropped.js";

const r = (...dropped: string[]) => ({ source: "x", created: true, dropped });

describe("tallyDropped", () => {
	it("counts the same loss once per issue, folding keys, most common first", () => {
		expect(
			tallyDropped([
				r("parent #98 (not in this migration)", "assignee (not mapped)"),
				r("parent ENG-4 (not in this migration)", "assignee (not mapped)", "assignee (not mapped)"),
				r("blockedBy #1 (not in this migration)"),
			])
		).toEqual([
			{ what: "assignee (not mapped)", count: 2 },
			{ what: "parent … (not in this migration)", count: 2 },
			{ what: "blockedBy … (not in this migration)", count: 1 },
		]);
	});

	it("is empty when nothing was lost", () => {
		expect(tallyDropped([r()])).toEqual([]);
	});
});
