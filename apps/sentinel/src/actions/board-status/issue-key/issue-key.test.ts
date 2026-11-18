import { describe, expect, it } from "vitest";

import { issueKey } from "./issue-key.js";

describe("issueKey", () => {
	it("is #N in the provider's own repository, whatever the case", () => {
		expect(issueKey("acme/widgets", 7, "acme/widgets")).toBe("#7");
		expect(issueKey("Acme/Widgets", 7, "acme/widgets")).toBe("#7");
	});

	it("names the repository anywhere else", () => {
		expect(issueKey("acme/other", 7, "acme/widgets")).toBe("acme/other#7");
	});
});
