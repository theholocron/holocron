import { describe, expect, it } from "vitest";

import { outputNames } from "./output-names.js";

describe("outputNames", () => {
	it("gives a file its own name with .yml", () => {
		expect(outputNames(["requests/collection.json"])).toEqual(["collection.yml"]);
		expect(outputNames(["a/one.json", "b/two.json"])).toEqual(["one.yml", "two.yml"]);
	});

	it("uses the whole path when two files share a name, so neither overwrites the other", () => {
		expect(outputNames(["apps/a/requests/collection.json", "apps/b/requests/collection.json"])).toEqual([
			"apps-a-requests-collection.yml",
			"apps-b-requests-collection.yml",
		]);
	});

	it("keeps a file with no extension whole", () => {
		expect(outputNames(["a/x", "b/x"])).toEqual(["a-x.yml", "b-x.yml"]);
	});
});
