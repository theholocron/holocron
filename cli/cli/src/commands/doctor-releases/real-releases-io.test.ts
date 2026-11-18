import { describe, expect, it } from "vitest";

import { parseTagList } from "./real-releases-io.js";

describe("parseTagList", () => {
	it("reads the tag and its time", () => {
		expect(parseTagList("v1.0.0 1700000000\nconfigs-v2.0.0-alpha.1 1700000100\n")).toEqual([
			{ name: "v1.0.0", createdAt: 1700000000 },
			{ name: "configs-v2.0.0-alpha.1", createdAt: 1700000100 },
		]);
	});

	it("keeps a tag whose time is missing, and skips blank lines", () => {
		expect(parseTagList("\nv1.0.0\n")).toEqual([{ name: "v1.0.0" }]);
	});
});
