import { describe, expect, it } from "vitest";

import { BrunoTooling, createPlugin, tooling } from "./index.js";

describe("createPlugin", () => {
	it("names the plugin and offers only the tooling capability, with no probes", () => {
		const plugin = createPlugin({ collectionFiles: ["requests/collection.json"] });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-bruno");
		expect(Object.keys(plugin.capabilities)).toEqual(["tooling"]);
		expect(plugin).not.toHaveProperty("probes");
	});

	it("builds a BrunoTooling over the options", () => {
		const built = createPlugin().capabilities.tooling();
		expect(built).toBeInstanceOf(BrunoTooling);
		expect(tooling({})).toBeInstanceOf(BrunoTooling);
		expect(built.providerName).toBe("bruno");
	});
});
