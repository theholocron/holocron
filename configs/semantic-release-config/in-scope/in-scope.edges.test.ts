import { describe, expect, it } from "vitest";

import { inScope, outsideFolders } from "./in-scope.js";

describe("in-scope, folders with a run of trailing slashes", () => {
	it("takes every trailing slash and a leading ./ off a folder", () => {
		expect(inScope(["clients/x.ts"], ["./clients///"])).toBe(true);
		expect(inScope(["clients-old/x.ts"], ["clients//"])).toBe(false);
		expect(outsideFolders(["utils/y.ts"], ["./clients//", "docs/"])).toBe(true);
		expect(outsideFolders(["clients/x.ts"], ["./clients//"])).toBe(false);
	});
});
