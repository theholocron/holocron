import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveOrg } from "./resolve-org.js";

describe("resolveOrg", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("prefers the flag, then HOLOCRON_ORG, then the config", () => {
		vi.stubEnv("HOLOCRON_ORG", "from-env");
		expect(resolveOrg({ org: "from-flag" }, { org: "from-config" })).toBe("from-flag");
		expect(resolveOrg({}, { org: "from-config" })).toBe("from-env");
		vi.stubEnv("HOLOCRON_ORG", "");
		expect(resolveOrg({}, { org: "from-config" })).toBe("from-config");
		expect(resolveOrg({}, {})).toBeUndefined();
	});
});
