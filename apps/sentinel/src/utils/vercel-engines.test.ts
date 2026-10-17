import { describe, expect, it } from "vitest";

import { vercelEngines } from "../../scripts/vercel-engines.mjs";

describe("vercelEngines (holocron#911)", () => {
	it("pins an open range to its floor's major, the only form Vercel accepts", () => {
		expect(vercelEngines({ node: ">=22" })).toEqual({ node: "22.x" });
		expect(vercelEngines({ node: "^24.1.0" })).toEqual({ node: "24.x" });
		expect(vercelEngines({ node: ">=22.12 <25" })).toEqual({ node: "22.x" });
	});

	it("leaves an already-valid major form and other engines fields alone", () => {
		expect(vercelEngines({ node: "22.x", npm: ">=10" })).toEqual({ node: "22.x", npm: ">=10" });
	});

	it("passes through a package with no engines.node", () => {
		expect(vercelEngines(undefined)).toBeUndefined();
		expect(vercelEngines({})).toEqual({});
	});

	it("throws rather than guess when the range has no version number", () => {
		expect(() => vercelEngines({ node: "latest" })).toThrow(/cannot derive a Vercel Node.js major/);
	});
});
