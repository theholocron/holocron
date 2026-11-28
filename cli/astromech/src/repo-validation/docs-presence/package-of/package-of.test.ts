import { describe, expect, it } from "vitest";

import { packageOf } from "./package-of.js";

describe("packageOf", () => {
	const packages: Record<string, { private?: boolean }> = {
		"utils/array-utils": {},
		"apps/sentinel": { private: true },
	};
	const read = (dir: string): { private?: boolean } | undefined => packages[dir];

	it("returns the package for its source and its root index", () => {
		expect(packageOf("utils/array-utils/src/is-valid.ts", read)).toBe("utils/array-utils");
		expect(packageOf("utils/array-utils/index.ts", read)).toBe("utils/array-utils");
	});

	it("ignores tests, other package files, private packages and files outside any package", () => {
		expect(packageOf("utils/array-utils/src/is-valid.test.ts", read)).toBeUndefined();
		expect(packageOf("utils/array-utils/package.json", read)).toBeUndefined();
		expect(packageOf("utils/array-utils/README.md", read)).toBeUndefined();
		expect(packageOf("apps/sentinel/src/index.ts", read)).toBeUndefined();
		expect(packageOf("scripts/release.mjs", read)).toBeUndefined();
		expect(packageOf("utils/array-utils/node_modules/x/src/a.ts", read)).toBeUndefined();
	});
});
