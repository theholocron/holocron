import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it } from "vitest";

import { validateRequiredChecks } from "./validate-required-checks.js";

describe("validateRequiredChecks", () => {
	it("accepts a repo that leaves the list out and one that lists its contexts", () => {
		expect(() => validateRequiredChecks(undefined)).not.toThrow();
		expect(() => validateRequiredChecks(["typecheck / Run typecheck", "format / Run prettier"])).not.toThrow();
	});

	it.each([[[]], ["typecheck"], [{}]])("refuses %j, which is not a non-empty list", (value) => {
		expect(() => validateRequiredChecks(value)).toThrow(ConfigError);
		expect(() => validateRequiredChecks(value)).toThrow(/non-empty list/);
	});

	it.each([[[""]], [["  "]], [[3]], [["typecheck / Run typecheck", null]]])(
		"names the position of a context that is not a string: %j",
		(value) => {
			const err = (() => {
				try {
					validateRequiredChecks(value);
				} catch (e) {
					return e;
				}
			})();
			expect(err).toBeInstanceOf(ConfigError);
			expect((err as ConfigError).message).toMatch(/repo\.requiredChecks\[\d\]` needs a status-check context/);
		}
	);

	it("refuses a context listed twice", () => {
		expect(() => validateRequiredChecks(["a / b", "a / b"])).toThrow(/requiredChecks\[1\].*listed twice/);
	});
});
