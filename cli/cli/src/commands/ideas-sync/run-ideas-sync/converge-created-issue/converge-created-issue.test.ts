import { describe, expect, it, vi } from "vitest";

import { convergeCreatedIssue } from "./converge-created-issue.js";

const MARKER = "<!-- holocron:idea idea.md -->";

function tracker(found: Array<{ key: string; body?: string }>, over: { comment?: () => Promise<void> } = {}) {
	return {
		search: vi.fn(async () => found),
		comment: vi.fn(over.comment ?? (async () => undefined)),
		transition: vi.fn(async () => ({ transitioned: true, status: "closed", via: "closed" })),
	};
}

describe("convergeCreatedIssue", () => {
	it("keeps its own issue when the search finds only that one", async () => {
		const issues = tracker([{ key: "#7", body: `x\n${MARKER}` }]);
		expect(await convergeCreatedIssue(issues as never, MARKER, "#7")).toEqual({
			key: "#7",
			warning: false,
			detail: "filed as #7",
		});
	});

	it("keeps its own issue when the search does not return it yet", async () => {
		const result = await convergeCreatedIssue(tracker([]) as never, MARKER, "#7");
		expect(result.key).toBe("#7");
		expect(result.warning).toBe(false);
	});

	it("keeps its own issue when the only other hit is a newer one, and does not touch it", async () => {
		const issues = tracker([{ key: "#8", body: MARKER }]);
		const result = await convergeCreatedIssue(issues as never, MARKER, "#7");
		expect(result.key).toBe("#7");
		expect(issues.comment).not.toHaveBeenCalled();
		expect(issues.transition).not.toHaveBeenCalled();
	});

	it("ignores a hit whose body lacks the exact marker or has no body", async () => {
		const issues = tracker([{ key: "#1", body: "<!-- holocron:idea other.md -->" }, { key: "#2" }]);
		const result = await convergeCreatedIssue(issues as never, MARKER, "#7");
		expect(result.key).toBe("#7");
		expect(issues.transition).not.toHaveBeenCalled();
	});

	it("closes its own issue with a comment and returns the older one", async () => {
		const issues = tracker([{ key: "#5", body: MARKER }]);
		const result = await convergeCreatedIssue(issues as never, MARKER, "#7");
		expect(result).toEqual({
			key: "#5",
			warning: false,
			detail: "filed as #5 (closed duplicate #7 from an overlapping run)",
		});
		expect(issues.comment).toHaveBeenCalledWith(
			"#7",
			"Duplicate of #5: the same idea was filed by two overlapping runs."
		);
		expect(issues.transition).toHaveBeenCalledWith("#7", "done");
	});

	it("warns and keeps its key when the comment cannot be added", async () => {
		const issues = tracker([{ key: "#5", body: MARKER }], {
			comment: async () => {
				throw new Error("nope");
			},
		});
		const result = await convergeCreatedIssue(issues as never, MARKER, "#7");
		expect(result.key).toBe("#7");
		expect(result.warning).toBe(true);
		expect(result.detail).toContain("#5");
		expect(result.detail).toContain("#7");
		expect(issues.transition).not.toHaveBeenCalled();
	});
});
