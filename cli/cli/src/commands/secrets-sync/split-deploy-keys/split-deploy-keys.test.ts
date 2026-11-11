import { describe, expect, it } from "vitest";

import { deployFilter } from "../deploy-filter/index.js";
import { splitDeployKeys } from "./split-deploy-keys.js";

describe("deployFilter", () => {
	it("unions the entries of the environment and ignores the others", () => {
		expect(
			deployFilter(
				[
					{ environment: "E", keys: ["A"] },
					{ environment: "E", prefix: "SENTINEL_" },
					{ environment: "E", keys: ["A", "B"] },
					{ environment: "Other", prefix: "X_" },
				],
				"E"
			)
		).toEqual({ keys: ["A", "B"], prefixes: ["SENTINEL_"] });
	});

	it("is undefined with no entry for the environment", () => {
		expect(deployFilter(undefined, "E")).toBeUndefined();
		expect(deployFilter([{ environment: "Other", prefix: "X_" }], "E")).toBeUndefined();
	});
});

describe("splitDeployKeys", () => {
	it("sends the prefixed and listed names and filters the rest", () => {
		expect(
			splitDeployKeys(["SENTINEL_A", "ADMIN_TOKEN", "LISTED", "sentinel_lower"], {
				keys: ["LISTED"],
				prefixes: ["SENTINEL_"],
			})
		).toEqual({ send: ["SENTINEL_A", "LISTED"], filtered: ["ADMIN_TOKEN", "sentinel_lower"] });
	});

	it("keeps a listed name the vault lacks in send, so the sync reports it", () => {
		expect(splitDeployKeys(["OTHER"], { keys: ["MISSING"], prefixes: [] })).toEqual({
			send: ["MISSING"],
			filtered: ["OTHER"],
		});
	});
});
