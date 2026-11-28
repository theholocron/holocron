import { afterEach, describe, expect, it, vi } from "vitest";

import { holocronEnv, PREFIX } from "./holocron-env.js";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("PREFIX", () => {
	it("is HOLOCRON, without a trailing underscore", () => {
		expect(PREFIX).toBe("HOLOCRON");
	});
});

describe("holocronEnv", () => {
	it("prefers the HOLOCRON_ name", () => {
		expect(holocronEnv({ HOLOCRON_AXIOM_DATASET: "new", AXIOM_DATASET: "old" }).get("AXIOM_DATASET")).toBe("new");
	});

	it("falls back to the bare name, so nothing that sets it breaks", () => {
		expect(holocronEnv({ AXIOM_DATASET: "old" }).get("AXIOM_DATASET")).toBe("old");
	});

	it("skips an empty prefixed value and is undefined when neither is set", () => {
		expect(holocronEnv({ HOLOCRON_AXIOM_DATASET: "", AXIOM_DATASET: "old" }).get("AXIOM_DATASET")).toBe("old");
		expect(holocronEnv({}).get("AXIOM_DATASET")).toBeUndefined();
	});

	it("reads the process environment when given no source", () => {
		vi.stubEnv("HOLOCRON_ENV_UTILS_TEST", "proc");
		expect(holocronEnv().get("ENV_UTILS_TEST")).toBe("proc");
	});
});
