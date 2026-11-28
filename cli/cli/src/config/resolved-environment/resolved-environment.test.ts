import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it } from "vitest";

import { resolvedEnvironment } from "./resolved-environment.js";

describe("resolvedEnvironment", () => {
	it("is the entry's environment", () => {
		expect(resolvedEnvironment({ environment: "theholocron/holocron - ci" })).toBe("theholocron/holocron - ci");
	});

	it("is a ConfigError naming the layer when it was never derived", () => {
		const err = (() => {
			try {
				return resolvedEnvironment({ layer: "prod" });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/"prod".*not derived/);
	});
});
