import { describe, expect, it } from "vitest";

import { secretRoutes } from "./secret-routes.js";

describe("secretRoutes", () => {
	it("gives one route per entry for the environment, with its keys and scope", () => {
		expect(
			secretRoutes(
				[
					{ environment: "CI", keys: ["A", "B"], scope: "org=theholocron" },
					{ environment: "CI", keys: ["C"] },
					{ environment: "Other", keys: ["D"] },
				],
				"CI"
			)
		).toEqual([
			{ scope: { kind: "organization", name: "theholocron" }, keys: ["A", "B"] },
			{ scope: { kind: "repo" }, keys: ["C"] },
		]);
	});

	it("leaves keys out when the entry lists none, so every key the vault holds is used", () => {
		expect(secretRoutes([{ environment: "CI", scope: "env=prod" }], "CI")).toEqual([
			{ scope: { kind: "environment", name: "prod" } },
		]);
	});

	it("has no routes for an environment no entry names, or when the config has no entries", () => {
		expect(secretRoutes([{ environment: "CI" }], "Other")).toEqual([]);
		expect(secretRoutes(undefined, "CI")).toEqual([]);
	});

	it("throws on a scope it cannot read", () => {
		expect(() => secretRoutes([{ environment: "CI", scope: "nowhere" }], "CI")).toThrow();
	});
});
