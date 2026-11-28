import { describe, expect, it } from "vitest";

import { ENVIRONMENT_LAYERS, isEnvironmentLayer, layerEnvironment } from "./layer-environment.js";

describe("layerEnvironment", () => {
	it.each(ENVIRONMENT_LAYERS)("names the %s layer after the repository", (layer) => {
		expect(layerEnvironment("theholocron/holocron", layer)).toBe(`theholocron/holocron - ${layer}`);
	});
});

describe("isEnvironmentLayer", () => {
	it.each(["local", "dev", "ci", "prod"])("accepts %s", (word) => {
		expect(isEnvironmentLayer(word)).toBe(true);
	});

	it.each(["Prod", "production", "Holocron - GitHub Actions", "", 3, undefined])("rejects %j", (word) => {
		expect(isEnvironmentLayer(word)).toBe(false);
	});
});
