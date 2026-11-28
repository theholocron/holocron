import { describe, expect, it } from "vitest";

import { isFeat } from "./is-feat.js";

describe("isFeat", () => {
	it("matches feat with or without a scope, a bang or a gitmoji", () => {
		expect(isFeat(["feat: add a thing"])).toBe(true);
		expect(isFeat(["feat(cli): ✨ add a thing"])).toBe(true);
		expect(isFeat(["fix: x", "feat!: break it"])).toBe(true);
	});

	it("ignores the other types", () => {
		expect(isFeat(["fix: x", "docs(cli): y", "refactor: z", "feature: nope"])).toBe(false);
		expect(isFeat([])).toBe(false);
	});
});
