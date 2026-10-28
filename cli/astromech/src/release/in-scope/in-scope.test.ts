import { describe, expect, it } from "vitest";

import { inScope } from "./in-scope.js";

describe("inScope", () => {
	it("matches a file under a folder, or the folder itself", () => {
		expect(inScope(["clients/http/src/x.ts"], ["clients"])).toBe(true);
		expect(inScope(["clients"], ["clients"])).toBe(true);
	});

	it("does not match a sibling folder that shares a prefix", () => {
		expect(inScope(["clients-old/x.ts", "utils/y.ts"], ["clients"])).toBe(false);
	});

	it("matches when any file is under any of several paths", () => {
		expect(inScope(["README.md", "docs/theme/a.css"], ["observability", "docs/theme"])).toBe(true);
	});

	it("normalizes ./ and trailing slashes on the paths", () => {
		expect(inScope(["clients/a.ts"], ["./clients/"])).toBe(true);
	});

	it("is false for no files", () => {
		expect(inScope([], ["clients"])).toBe(false);
	});
});
