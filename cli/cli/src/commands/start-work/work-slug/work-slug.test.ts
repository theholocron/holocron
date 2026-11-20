import { describe, expect, it } from "vitest";

import { workSlug } from "./work-slug.js";

describe("workSlug", () => {
	it("takes the prefix and emoji off and kebab-cases the title", () => {
		expect(workSlug("feat(cli): ✨ Work commands for one piece of work")).toBe(
			"work-commands-for-one-piece-of-work"
		);
	});

	it("cuts a long title at a word", () => {
		const slug = workSlug("a very long title that keeps going well past the forty character limit")!;
		expect(slug.length).toBeLessThanOrEqual(40);
		expect(slug).toBe("a-very-long-title-that-keeps-going-well");
	});

	it("cuts a single word longer than the limit, and keeps a cut that falls on a word end", () => {
		expect(workSlug("x".repeat(60))).toBe("x".repeat(40));
		expect(workSlug(`${"a".repeat(39)} bbbb`)).toBe("a".repeat(39));
	});

	it("uses --name whole when it is kebab-case, and refuses one that is not", () => {
		expect(workSlug("anything", "my-name")).toBe("my-name");
		expect(workSlug("anything", "My Name")).toBeUndefined();
	});

	it("has no slug for a title with nothing in it", () => {
		expect(workSlug("✨ ")).toBeUndefined();
	});
});
