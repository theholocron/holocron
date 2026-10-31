import { describe, expect, it } from "vitest";

import { tokens } from "./index.js";

describe("the plugin's tokens export", () => {
	it("lists each token the plugin resolves, with where it is looked up", () => {
		expect(tokens).toEqual([
			{ envName: "HOLOCRON_NETLIFY_TOKEN", vendorEnvName: "NETLIFY_AUTH_TOKEN", keyringKey: "netlify" },
		]);
	});
});
