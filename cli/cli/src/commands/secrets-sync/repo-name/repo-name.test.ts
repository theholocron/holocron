import { describe, expect, it } from "vitest";

import { repoName } from "./repo-name.js";

describe("repoName", () => {
	it("takes the name from an owner-qualified repository and leaves a bare name alone", () => {
		expect(repoName("theholocron/holocron")).toBe("holocron");
		expect(repoName(".github")).toBe(".github");
	});
});
