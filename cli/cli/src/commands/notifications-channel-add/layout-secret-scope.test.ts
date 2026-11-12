import { describe, expect, it } from "vitest";

import { layoutSecretScope } from "./layout-secret-scope.js";

const org = { kind: "organization", name: "acme" } as const;

describe("layoutSecretScope", () => {
	it("narrows an organization scope to the readers, by repository name, once each", () => {
		expect(layoutSecretScope(org, ["acme/a", "acme/.github", "acme/a"])).toEqual({
			scope: { kind: "organization", name: "acme", visibility: "selected", repos: ["a", ".github"] },
		});
	});

	it("refuses an organization scope with no readers instead of leaving it readable by every repository", () => {
		for (const readers of [undefined, []]) {
			expect(layoutSecretScope(org, readers)).toEqual({ problem: expect.stringMatching(/`readers`/) });
		}
	});

	it("refuses a reader outside the organization, naming it", () => {
		expect(layoutSecretScope(org, ["acme/a", "other/b"])).toEqual({
			problem: expect.stringMatching(/must be repositories of acme.*other\/b/),
		});
	});

	it("leaves a repository or environment scope as it is", () => {
		expect(layoutSecretScope({ kind: "repo" }, undefined)).toEqual({ scope: { kind: "repo" } });
		const env = { kind: "environment", name: "prod" } as const;
		expect(layoutSecretScope(env, ["acme/a"])).toEqual({ scope: env });
	});
});
