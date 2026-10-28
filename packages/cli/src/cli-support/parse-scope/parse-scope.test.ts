import { describe, expect, it } from "vitest";

import { parseScope } from "./parse-scope.js";

describe("parseScope", () => {
	it("reads repo, env=<name> and org=<name>", () => {
		expect(parseScope("repo")).toEqual({ kind: "repo" });
		expect(parseScope("env=staging")).toEqual({ kind: "environment", name: "staging" });
		expect(parseScope("org=theholocron")).toEqual({ kind: "organization", name: "theholocron" });
	});

	it("says what it expected for anything else", () => {
		expect(() => parseScope("team=x")).toThrow(
			'invalid --scope "team=x" — expected "repo", "env=<name>", or "org=<name>"'
		);
	});
});
