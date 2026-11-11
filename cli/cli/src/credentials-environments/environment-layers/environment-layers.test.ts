import { describe, expect, it } from "vitest";

import { environmentLayers } from "./environment-layers.js";

describe("environmentLayers", () => {
	const slug = "theholocron/holocron";

	it("reads local, optional, and then dev on a machine", () => {
		expect(environmentLayers(slug, "local")).toEqual([
			{ name: `${slug} - local`, optional: true, legacy: false },
			{ name: `${slug} - dev`, optional: false, legacy: false },
		]);
	});

	it.each([
		["development", "dev"],
		["ci", "ci"],
		["production", "prod"],
	] as const)("reads only its own Environment in the %s layer", (layer, suffix) => {
		expect(environmentLayers(slug, layer)).toEqual([
			{ name: `${slug} - ${suffix}`, optional: false, legacy: false },
		]);
	});

	it("reads none in the test layer", () => {
		expect(environmentLayers(slug, "test")).toEqual([]);
	});
});
