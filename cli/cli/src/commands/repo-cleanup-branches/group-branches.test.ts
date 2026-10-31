import { describe, expect, it } from "vitest";

import { groupBranches } from "./group-branches.js";
import type { ClassifiedBranch } from "./repo-cleanup-branches.type.js";

const c = (
	name: string,
	where: "local" | "remote",
	group: ClassifiedBranch["group"],
	date?: string,
	pr?: number
): ClassifiedBranch => ({
	ref: { name, sha: `sha-${name}-${where}`, where, ...(date ? { date } : {}) },
	group,
	...(pr === undefined ? {} : { pr }),
});

describe("groupBranches", () => {
	it("makes a branch on both sides one entry naming both places", () => {
		const entries = groupBranches([c("x", "local", "merged", "2026-10-01"), c("x", "remote", "merged")]);
		expect(entries).toEqual([{ name: "x", group: "merged", locations: ["local", "remote"], date: "2026-10-01" }]);
	});

	it("keeps two entries for a name whose refs classify differently", () => {
		const entries = groupBranches([
			c("x", "local", "squash-merged", "2026-10-01", 4),
			c("x", "remote", "has-extra", undefined, 4),
		]);
		expect(entries.map((e) => [e.group, e.locations])).toEqual([
			["squash-merged", ["local"]],
			["has-extra", ["remote"]],
		]);
		expect(entries[0]).toMatchObject({ pr: 4 });
	});

	it("takes the newest local date, and sorts newest first with undated ones after, by name", () => {
		const entries = groupBranches([
			c("old", "local", "no-pr", "2026-09-01"),
			c("zeta", "remote", "no-pr"),
			c("alpha-remote", "remote", "no-pr"),
			c("new", "local", "no-pr", "2026-10-09"),
			c("new", "local", "no-pr", "2026-10-05"),
		]);
		expect(entries.map((e) => e.name)).toEqual(["new", "old", "alpha-remote", "zeta"]);
		expect(entries[0]?.date).toBe("2026-10-09");
	});

	it("keeps the first date when a later ref is older", () => {
		const entries = groupBranches([c("a", "local", "no-pr", "2026-10-09"), c("a", "local", "no-pr", "2026-10-01")]);
		expect(entries[0]?.date).toBe("2026-10-09");
	});
});
