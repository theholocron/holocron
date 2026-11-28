import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it } from "vitest";

import { validateEnvironmentChoice } from "./validate-environment-choice.js";

const run = (entry: { environment?: unknown; layer?: unknown }, required?: boolean): unknown =>
	(() => {
		try {
			return validateEnvironmentChoice(entry, "an entry", required);
		} catch (e) {
			return e;
		}
	})();

describe("validateEnvironmentChoice", () => {
	it("returns a literal environment as it is", () => {
		expect(run({ environment: "Mine" })).toBe("Mine");
	});

	it("returns a layer word", () => {
		expect(run({ layer: "ci" })).toBe("ci");
	});

	it("rejects a layer and an environment together", () => {
		const err = run({ layer: "ci", environment: "Mine" });
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/both `layer` and `environment`/);
	});

	it("rejects a layer that is not a layer word, listing the words", () => {
		expect((run({ layer: "production" }) as Error).message).toMatch(/"local", "dev", "ci", "prod"/);
	});

	it.each(["", "  ", 3])("rejects an environment of %j", (environment) => {
		expect((run({ environment }) as Error).message).toMatch(/empty `environment`/);
	});

	it("rejects neither by default", () => {
		expect((run({}) as Error).message).toMatch(/or a `layer`/);
	});

	it("allows neither when it is not required", () => {
		expect(run({}, false)).toBeUndefined();
	});
});
