import { describe, expect, it } from "vitest";

import { outputNames } from "./output-names.js";

describe("outputNames", () => {
	it("gives a file its own name with .bruno.json", () => {
		expect(outputNames(["requests/collection.json"])).toEqual(["collection.bruno.json"]);
		expect(outputNames(["a/one.json", "b/two.json"])).toEqual(["one.bruno.json", "two.bruno.json"]);
	});

	it("leaves out a .collection part, so a file named for its API gets that name", () => {
		expect(outputNames(["apps/sentinel/api/webhook.collection.json"])).toEqual(["webhook.bruno.json"]);
	});

	it("uses the whole path when two files share a name, so neither overwrites the other", () => {
		expect(outputNames(["apps/a/requests/collection.json", "apps/b/requests/collection.json"])).toEqual([
			"apps-a-requests-collection.bruno.json",
			"apps-b-requests-collection.bruno.json",
		]);
	});

	it("takes the extension it is given", () => {
		expect(outputNames(["requests/collection.json"], ".yml")).toEqual(["collection.yml"]);
		expect(outputNames(["a/x.json", "b/x.json"], ".yml")).toEqual(["a-x.yml", "b-x.yml"]);
	});

	it("keeps a file with no extension whole", () => {
		expect(outputNames(["a/x", "b/x"])).toEqual(["a-x.bruno.json", "b-x.bruno.json"]);
	});
});
