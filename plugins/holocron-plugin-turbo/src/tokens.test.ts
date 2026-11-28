import { describe, expect, it } from "vitest";

import { tokens } from "./index.js";

describe("the plugin's tokens export", () => {
	it("declares the Turbo token for the ci layer only", () => {
		expect(tokens).toEqual([
			{
				envName: "HOLOCRON_TURBO_TOKEN",
				vendorEnvName: "TURBO_TOKEN",
				keyringKey: "turbo",
				expect: { layers: ["ci"] },
			},
		]);
	});
});
