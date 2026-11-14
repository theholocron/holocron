import { describe, expect, it } from "vitest";

import type { PluginToken } from "../auth/index.js";
import { tokenExpectations } from "./token-expectations.js";

const base = { keyringKey: "k" };
const tokens: PluginToken[] = [
	{
		...base,
		envName: "A_TOKEN",
		expect: {
			permissions: {
				ci: { pages: "required", dns: "absent" },
				dev: { pages: "required", dns: "required" },
			},
		},
	},
	{ ...base, envName: "B_TOKEN", expect: { layers: ["prod", "ci"] } },
	{ ...base, envName: "C_TOKEN" },
];

describe("tokenExpectations", () => {
	it("lists each token and layer that holds it, layers in their fixed order, with required and absent split", () => {
		expect(tokenExpectations(tokens)).toEqual([
			{
				envName: "A_TOKEN",
				layer: "dev",
				rules: { pages: "required", dns: "required" },
				required: ["pages", "dns"],
				absent: [],
			},
			{
				envName: "A_TOKEN",
				layer: "ci",
				rules: { pages: "required", dns: "absent" },
				required: ["pages"],
				absent: ["dns"],
			},
			{ envName: "B_TOKEN", layer: "ci", rules: {}, required: [], absent: [] },
			{ envName: "B_TOKEN", layer: "prod", rules: {}, required: [], absent: [] },
		]);
	});

	it("narrows to a layer", () => {
		expect(tokenExpectations(tokens, { layer: "ci" }).map((e) => e.envName)).toEqual(["A_TOKEN", "B_TOKEN"]);
		expect(tokenExpectations(tokens, { layer: "local" })).toEqual([]);
		expect(tokenExpectations(tokens, { layer: "not-a-layer" })).toEqual([]);
	});

	it("narrows to a token", () => {
		expect(tokenExpectations(tokens, { envName: "B_TOKEN" }).map((e) => e.layer)).toEqual(["ci", "prod"]);
		expect(tokenExpectations(tokens, { envName: "C_TOKEN" })).toEqual([]);
	});

	it("is empty for no tokens", () => {
		expect(tokenExpectations([])).toEqual([]);
	});

	it("treats a declaration that names neither layers nor permissions as holding nothing", () => {
		expect(tokenExpectations([{ ...base, envName: "D", expect: {} }])).toEqual([]);
	});
});
