import { describe, expect, it } from "vitest";

import { specName } from "./spec-name.js";

describe("specName", () => {
	it("strips the conventional-commit prefix and the emoji, and kebab-cases with tech-", () => {
		expect(specName("feat(ideas): 📝 holocron ideas promote turns a filed idea into a draft spec")).toBe(
			"tech-holocron-ideas-promote-turns-a-filed-idea-into-a-draft-spec"
		);
		expect(specName("fix!: 🐛 Don't break, ever")).toBe("tech-don-t-break-ever");
	});

	it("keeps a title with no prefix", () => {
		expect(specName("An idea about X")).toBe("tech-an-idea-about-x");
	});

	it("cuts a long title at a word", () => {
		const name = specName("one two three four five six seven eight nine ten eleven twelve thirteen fourteen")!;
		expect(name.length).toBeLessThanOrEqual("tech-".length + 60);
		expect(name.endsWith("-")).toBe(false);
		expect(name).toMatch(/^tech-one-two-three/);
	});

	it("cuts a single long word without a break", () => {
		expect(specName("a".repeat(100))).toBe(`tech-${"a".repeat(60)}`);
	});

	it("has no name for a title with nothing left", () => {
		expect(specName("📝")).toBeUndefined();
	});

	it("takes --name as the whole name and drops the file ending", () => {
		expect(specName("anything", "process-release-notes")).toBe("process-release-notes");
		expect(specName("anything", "ci-x.spec.md")).toBe("ci-x");
		expect(specName("anything", "ci-x.md")).toBe("ci-x");
	});

	it("rejects a --name that is not kebab-case", () => {
		expect(specName("anything", "Not Kebab")).toBeUndefined();
		expect(specName("anything", "../escape")).toBeUndefined();
		expect(specName("anything", "")).toBeUndefined();
	});
});
