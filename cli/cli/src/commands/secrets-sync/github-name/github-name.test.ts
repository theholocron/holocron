import { describe, expect, it } from "vitest";

import { githubNameProblem } from "./github-name.js";

describe("githubNameProblem", () => {
	it.each(["SENTINEL_AXIOM_INGEST_TOKEN", "_LEADING", "a1_b2", "HOLOCRON_GITHUB_APP_ID", "GITHUB"])(
		"accepts %s",
		(name) => {
			expect(githubNameProblem(name)).toBeUndefined();
		}
	);

	it.each(["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "github_token"])(
		"rejects the reserved prefix in %s",
		(name) => {
			expect(githubNameProblem(name)).toMatch(/reserves names starting with GITHUB_/);
		}
	);

	it("rejects a leading digit", () => {
		expect(githubNameProblem("1PASSWORD")).toMatch(/start with a number/);
	});

	it.each(["HAS SPACE", "has-dash", "dot.ted", "ünï"])("rejects the character set of %s", (name) => {
		expect(githubNameProblem(name)).toMatch(/letters, digits and underscores/);
	});

	it("rejects an empty name", () => {
		expect(githubNameProblem("")).toMatch(/empty/);
	});
});
