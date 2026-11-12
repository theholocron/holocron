import { describe, expect, it } from "vitest";

import { validateSecretsDeploy } from "./validate-secrets-deploy.js";

describe("validateSecretsDeploy", () => {
	it("accepts no entries, a list, a prefix, or both", () => {
		expect(() => validateSecretsDeploy(undefined)).not.toThrow();
		expect(() => validateSecretsDeploy({ deploy: [] })).not.toThrow();
		expect(() => validateSecretsDeploy({ deploy: [{ environment: "E", keys: ["A"] }] })).not.toThrow();
		expect(() => validateSecretsDeploy({ deploy: [{ environment: "E", prefix: "SENTINEL_" }] })).not.toThrow();
		expect(() => validateSecretsDeploy({ deploy: [{ layer: "prod", prefix: "SENTINEL_" }] })).not.toThrow();
		expect(() =>
			validateSecretsDeploy({ deploy: [{ environment: "E", keys: ["A"], prefix: "SENTINEL_" }] })
		).not.toThrow();
	});

	it.each([
		["neither keys nor prefix", { environment: "E" }],
		["an empty keys list and no prefix", { environment: "E", keys: [] }],
		["an empty prefix", { environment: "E", keys: ["A"], prefix: "" }],
		["an empty key name", { environment: "E", keys: [""] }],
		["no environment", { environment: " ", keys: ["A"] }],
		["neither an environment nor a layer", { keys: ["A"] }],
		["a layer and an environment", { layer: "prod", environment: "E", keys: ["A"] }],
		["a layer that is no layer word", { layer: "production", keys: ["A"] }],
		["the dev layer, which is never synced", { layer: "dev", keys: ["A"] }],
		["the local layer, which is never synced", { layer: "local", prefix: "X_" }],
	])("is a ConfigError for %s", (_label, entry) => {
		const err = (() => {
			try {
				validateSecretsDeploy({ deploy: [entry as never] });
			} catch (e) {
				return e;
			}
		})();
		expect((err as Error).name).toBe("ConfigError");
		expect((err as Error).message).toMatch(/repo\.secrets\.deploy/);
	});
});
