import { describe, expect, it } from "vitest";

import { createEnvLookup } from "./create-env-lookup.js";
import { firstEnv } from "./first-env.js";

describe("firstEnv", () => {
	it("returns the first name that is set", () => {
		const env = createEnvLookup({ A: "a", B: "b" });
		expect(firstEnv(env, ["A", "B"])).toBe("a");
	});

	it("skips unset names", () => {
		const env = createEnvLookup({ B: "b" });
		expect(firstEnv(env, ["A", "B"])).toBe("b");
	});

	it("skips empty values, matching EnvLookup.get", () => {
		const env = createEnvLookup({ A: "", B: "b" });
		expect(firstEnv(env, ["A", "B"])).toBe("b");
	});

	it("returns the fallback when no name is set", () => {
		const env = createEnvLookup({});
		expect(firstEnv(env, ["A", "B"], "default")).toBe("default");
	});

	it("returns undefined without a fallback when no name is set", () => {
		const env = createEnvLookup({});
		expect(firstEnv(env, ["A", "B"])).toBeUndefined();
	});

	it("prefers a set name over the fallback", () => {
		const env = createEnvLookup({ A: "a" });
		expect(firstEnv(env, ["A"], "default")).toBe("a");
	});

	it("returns the fallback for an empty list of names", () => {
		expect(firstEnv(createEnvLookup({ A: "a" }), [], "default")).toBe("default");
	});
});
