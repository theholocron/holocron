import { describe, expect, it } from "vitest";

import { variableRoutes } from "./variable-routes.js";

describe("variableRoutes", () => {
	it("gives one route per entry that names the environment, scope defaulting to repo", () => {
		expect(
			variableRoutes(
				[
					{ environment: "Vars", keys: ["A"], scope: "org=o", visibility: "private" },
					{ environment: "Vars", keys: ["B"] },
					{ environment: "Other", keys: ["C"] },
				],
				"Vars"
			)
		).toEqual([
			{ scope: { kind: "organization", name: "o" }, keys: ["A"], visibility: "private" },
			{ scope: { kind: "repo" }, keys: ["B"] },
		]);
	});

	it("has none for an environment no entry names, or no entries", () => {
		expect(variableRoutes(undefined, "Vars")).toEqual([]);
		expect(variableRoutes([{ environment: "Other", keys: ["C"] }], "Vars")).toEqual([]);
	});

	it("refuses an environment scope, which has no variables", () => {
		expect(() => variableRoutes([{ environment: "Vars", keys: ["A"], scope: "env=qa" }], "Vars")).toThrow(
			/expected "repo" or "org=<name>"/
		);
	});
});
