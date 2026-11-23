import type { IssueRecord } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { issue, scopeWith } from "../test-helpers.js";
import { kindLabels } from "./issue-kind.js";
import { LinearIssues } from "./issues.js";
import { droppedFor } from "./issues-migration.js";

const record = (kind?: string) =>
	({
		key: "#1",
		title: "t",
		labels: [],
		comments: [],
		blockedBy: [],
		...(kind ? { kind } : {}),
	}) as unknown as IssueRecord;

describe("a kind Linear has no label for", () => {
	it("is a dropped line when an issue is made, and the issue is still made", async () => {
		const s = scopeWith([[/issueCreate/, { issueCreate: { issue: issue({ identifier: "ENG-9" }) } }]]);
		const out = await new LinearIssues(s.scope, {}).create({ summary: "t", kind: "spike" });
		expect(out.key).toBe("ENG-9");
		expect(out.dropped).toContain("kind spike (not carried: no Linear label)");
	});

	it("is a dropped line in a migration result, and a declared one is not", () => {
		expect(droppedFor(record("spike"), undefined)).toContain("kind spike (not carried: no Linear label)");
		expect(droppedFor(record("spike"), undefined, kindLabels([{ name: "Spike" }]))).toEqual([]);
		expect(droppedFor(record(), undefined)).toEqual([]);
	});
});
