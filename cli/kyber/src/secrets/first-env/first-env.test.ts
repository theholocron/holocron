import { afterEach, describe, expect, it, vi } from "vitest";

import { firstEnv } from "./first-env.js";

afterEach(() => vi.unstubAllEnvs());

describe("firstEnv", () => {
	it("takes the first name that has a value, in the order given", () => {
		expect(firstEnv({ A: "a", B: "b" }, "B", "A")).toBe("b");
		expect(firstEnv({ B: "b" }, "A", "B")).toBe("b");
	});

	it("treats an empty string as unset", () => {
		expect(firstEnv({ A: "", B: "b" }, "A", "B")).toBe("b");
		expect(firstEnv({ A: "" }, "A")).toBeUndefined();
	});

	it("reads the process environment when no env is given", () => {
		vi.stubEnv("KYBER_FIRST_ENV_TEST", "from-process");
		expect(firstEnv(undefined, "KYBER_FIRST_ENV_TEST")).toBe("from-process");
	});
});
