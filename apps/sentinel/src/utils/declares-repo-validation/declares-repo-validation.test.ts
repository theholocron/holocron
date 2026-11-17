import { describe, expect, it } from "vitest";

import { declaresRepoValidation } from "./declares-repo-validation.js";

describe("declaresRepoValidation", () => {
	it.each(["platform.repoValidation", "validate", "validate:specs", "validate:docs"])("is true for %s", (name) => {
		expect(declaresRepoValidation(["lint:code", name, "typecheck"])).toBe(true);
	});

	it("is false for a config that names none of them", () => {
		expect(declaresRepoValidation(["lint:code", "typecheck", "validate:deps", "validate:generated"])).toBe(false);
		expect(declaresRepoValidation([])).toBe(false);
	});
});
