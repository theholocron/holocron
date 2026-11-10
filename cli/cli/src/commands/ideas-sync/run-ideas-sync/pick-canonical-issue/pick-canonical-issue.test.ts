import { describe, expect, it } from "vitest";

import { pickCanonicalIssue } from "./pick-canonical-issue.js";

const issue = (key: string, statusCategory: "open" | "done") => ({ key, statusCategory });

describe("pickCanonicalIssue", () => {
	it("returns undefined for no hits", () => {
		expect(pickCanonicalIssue([])).toBeUndefined();
	});

	it("prefers an open issue over a closed one listed first", () => {
		expect(pickCanonicalIssue([issue("#2", "done"), issue("#9", "open")])?.key).toBe("#9");
	});

	it("takes the oldest of the open ones", () => {
		expect(pickCanonicalIssue([issue("#9", "open"), issue("#4", "open"), issue("#1", "done")])?.key).toBe("#4");
	});

	it("takes the oldest of all when every hit is closed", () => {
		expect(pickCanonicalIssue([issue("#9", "done"), issue("#3", "done")])?.key).toBe("#3");
	});

	it("takes the only open hit", () => {
		expect(pickCanonicalIssue([issue("#6", "open")])?.key).toBe("#6");
	});
});
