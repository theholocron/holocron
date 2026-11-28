import { describe, expect, it } from "vitest";

import { pageNames } from "./page-names.js";

describe("pageNames", () => {
	it("adds the names without -client and holocron-plugin-", () => {
		expect(pageNames("clients/axiom-client")).toEqual(["axiom-client", "axiom"]);
		expect(pageNames("plugins/holocron-plugin-github")).toEqual(["holocron-plugin-github", "github"]);
		expect(pageNames("utils/array-utils")).toEqual(["array-utils"]);
	});
});
