import { describe, expect, it } from "vitest";

import { validateSecretsDeploy } from "./validate-secrets-deploy.js";

describe("validateSecretsDeploy", () => {
	it("accepts no entries, a list, a prefix, or both", () => {
		expect(() => validateSecretsDeploy(undefined)).not.toThrow();
		expect(() => validateSecretsDeploy({ deploy: [] })).not.toThrow();
		expect(() => validateSecretsDeploy({ deploy: [{ environment: "E", keys: ["A"] }] })).not.toThrow();
		expect(() => validateSecretsDeploy({ deploy: [{ environment: "E", prefix: "SENTINEL_" }] })).not.toThrow();
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
	])("is a ConfigError for %s", (_label, entry) => {
		const err = (() => {
			try {
				validateSecretsDeploy({ deploy: [entry] });
			} catch (e) {
				return e;
			}
		})();
		expect((err as Error).name).toBe("ConfigError");
		expect((err as Error).message).toMatch(/repo\.secrets\.deploy/);
	});
});
