import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it } from "vitest";

import type { RepoLabels } from "../config/index.js";
import { validateRepoLabels } from "./validate-repo-labels.js";

function problem(labels: RepoLabels): string {
	const err = (() => {
		try {
			validateRepoLabels(labels);
		} catch (e) {
			return e;
		}
	})();
	expect(err).toBeInstanceOf(ConfigError);
	return (err as ConfigError).message;
}

describe("validateRepoLabels", () => {
	it("accepts no labels, no areas and a good map", () => {
		expect(() => validateRepoLabels(undefined)).not.toThrow();
		expect(() => validateRepoLabels({})).not.toThrow();
		expect(() =>
			validateRepoLabels({
				areas: { cli: ["cli/**"], docs: ["docs/**", "!docs/wiki/**"], "a.b_c-d": ["x"] },
				scopes: { sentinel: "cli", docs: "docs" },
			})
		).not.toThrow();
	});

	it("names the path of a name that cannot be a label suffix", () => {
		expect(problem({ areas: { "has space": ["a/**"] } })).toMatch(
			/`repo.labels.areas.has space`.*cannot be the name/
		);
		expect(problem({ areas: { "a:b": ["a/**"] } })).toMatch(/cannot be the name/);
		expect(problem({ areas: { "-x": ["a/**"] } })).toMatch(/cannot be the name/);
		expect(problem({ areas: { ["a".repeat(46)]: ["a/**"] } })).toMatch(/at most 45/);
	});

	it("refuses a name given twice whatever the case", () => {
		expect(problem({ areas: { cli: ["a/**"], CLI: ["b/**"] } })).toMatch(
			/`repo.labels.areas.CLI`: duplicates `repo.labels.areas.cli`/
		);
	});

	it("refuses an empty pattern list, an empty pattern and only exclusions", () => {
		expect(problem({ areas: { cli: [] } })).toMatch(/`repo.labels.areas.cli` needs a list of folder patterns/);
		expect(problem({ areas: { cli: "cli/**" as unknown as string[] } })).toMatch(/needs a list/);
		expect(problem({ areas: { cli: ["cli/**", " "] } })).toMatch(/empty pattern/);
		expect(problem({ areas: { cli: ["!"] } })).toMatch(/empty pattern/);
		expect(problem({ areas: { cli: [3 as unknown as string] } })).toMatch(/empty pattern/);
		expect(problem({ areas: { cli: ["!cli/x/**"] } })).toMatch(/only exclusions/);
	});

	it("refuses a scope naming an area that is not declared, and says what is", () => {
		expect(problem({ areas: { cli: ["cli/**"] }, scopes: { sentinel: "sentinel" } })).toMatch(
			/`repo.labels.scopes.sentinel` names the unknown area "sentinel"; the declared areas are cli/
		);
		expect(problem({ scopes: { sentinel: "sentinel" } })).toMatch(/declares none/);
		expect(problem({ areas: { cli: ["a"] }, scopes: { x: 3 as unknown as string } })).toMatch(/unknown area 3/);
		expect(problem({ areas: { cli: ["a"] }, scopes: { " ": "cli" } })).toMatch(/empty scope name/);
	});
});
