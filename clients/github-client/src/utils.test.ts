import { describe, expect, it } from "vitest";

import { splitRepo } from "./utils.js";

describe("splitRepo", () => {
	it("splits an owner/name string", () => {
		expect(splitRepo("theholocron/holocron")).toEqual(["theholocron", "holocron"]);
	});

	it("returns an empty name when there is no slash", () => {
		expect(splitRepo("theholocron")).toEqual(["theholocron", ""]);
	});

	it("returns an empty owner and name for an empty string", () => {
		expect(splitRepo("")).toEqual(["", ""]);
	});
});
