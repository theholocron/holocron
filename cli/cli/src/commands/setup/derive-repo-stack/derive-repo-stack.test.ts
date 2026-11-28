import { describe, expect, it } from "vitest";

import { deriveRepoStack } from "./derive-repo-stack.js";

describe("deriveRepoStack", () => {
	it("unions the root and every workspace package, in table order, without repeats", () => {
		expect(
			deriveRepoStack({ devDependencies: { vitest: "^3.0.0", vite: "^7.0.0" } }, [
				{ dependencies: { next: "^15.0.0" } },
				{ dependencies: { vite: "^7.0.0" } },
			])
		).toEqual(["next", "vite", "vitest"]);
	});

	it("is empty with no root package.json and no workspace packages", () => {
		expect(deriveRepoStack(null, [])).toEqual([]);
	});
});
