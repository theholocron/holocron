import { describe, expect, it } from "vitest";

import { inScope, outsideFolders } from "./in-scope.js";

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

describe("outsideFolders", () => {
	it("is true when a file is outside every folder", () => {
		expect(outsideFolders(["cli/cli/src/x.ts"], ["observability"])).toBe(true);
		expect(outsideFolders(["observability/src/x.ts", "README.md"], ["observability"])).toBe(true);
	});

	it("is false when every file is inside some folder", () => {
		expect(outsideFolders(["observability/src/x.ts", "skills/a.md"], ["observability", "skills"])).toBe(false);
		expect(outsideFolders(["observability"], ["observability"])).toBe(false);
	});

	it("does not take a sibling that shares a prefix for the folder", () => {
		expect(outsideFolders(["observability-old/x.ts"], ["observability"])).toBe(true);
	});

	it("normalizes ./ and trailing slashes, and is false for no files", () => {
		expect(outsideFolders(["observability/a.ts"], ["./observability/"])).toBe(false);
		expect(outsideFolders([], ["observability"])).toBe(false);
	});

	it("is true for everything when there are no folders", () => {
		expect(outsideFolders(["a.ts"], [])).toBe(true);
	});
});
