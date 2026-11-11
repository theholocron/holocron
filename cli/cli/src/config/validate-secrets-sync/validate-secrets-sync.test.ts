import { describe, expect, it } from "vitest";

import { validateSecretsSync } from "./validate-secrets-sync.js";

describe("validateSecretsSync", () => {
	it("accepts no entries, an environment, or a layer", () => {
		expect(() => validateSecretsSync(undefined)).not.toThrow();
		expect(() => validateSecretsSync({ sync: [{ environment: "E" }, { layer: "ci", keys: ["A"] }] })).not.toThrow();
	});

	it.each([
		["neither", {}],
		["both", { environment: "E", layer: "ci" }],
		["a layer that is no layer word", { layer: "Prod" }],
	])("is a ConfigError for %s", (_label, entry) => {
		const err = (() => {
			try {
				validateSecretsSync({ sync: [entry as never] });
			} catch (e) {
				return e;
			}
		})();
		expect((err as Error).name).toBe("ConfigError");
		expect((err as Error).message).toMatch(/repo\.secrets\.sync/);
	});
});
