import { describe, expect, it } from "vitest";

import { prKey } from "./pr-key.js";

describe("prKey", () => {
	it("joins the repository and the number", () => {
		expect(prKey("theholocron/holocron", 123)).toBe("theholocron/holocron#123");
	});
});
