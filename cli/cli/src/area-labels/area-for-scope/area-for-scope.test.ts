import { describe, expect, it } from "vitest";

import { areaForScope } from "./area-for-scope.js";

describe("areaForScope", () => {
	const scopes = { Sentinel: "sentinel", deps: "tooling" };

	it("gives the mapped area whatever the case", () => {
		expect(areaForScope("sentinel", scopes)).toBe("sentinel");
		expect(areaForScope(" DEPS ", scopes)).toBe("tooling");
	});

	it("gives nothing for a scope the map lacks or no map", () => {
		expect(areaForScope("env", scopes)).toBeUndefined();
		expect(areaForScope("cli", undefined)).toBeUndefined();
	});
});
