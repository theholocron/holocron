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

	it("accepts a kind table, a fallback table and a list of repositories", () => {
		expect(() =>
			validateRepoLabels({
				kinds: { bug: "Bug", Defect: "Bug" },
				fallbackKinds: {},
				repos: ["theholocron/holocron", "acme/a.b_c-d"],
			})
		).not.toThrow();
	});

	it("names the path of a kind label that is empty or too long, or a Type that is not a name", () => {
		expect(problem({ kinds: { " ": "Bug" } })).toMatch(/`repo.labels.kinds. `: a label name is 1 to 50/);
		expect(problem({ fallbackKinds: { ["x".repeat(51)]: "Task" } })).toMatch(
			/`repo.labels.fallbackKinds.x+`: a label name/
		);
		expect(problem({ kinds: { bug: "" } })).toMatch(/`repo.labels.kinds.bug` needs the name of an issue Type/);
		expect(problem({ kinds: { bug: 3 as unknown as string } })).toMatch(/needs the name of an issue Type/);
	});

	it("refuses a label that is in both tables, or twice whatever the case", () => {
		expect(problem({ kinds: { ci: "Task" }, fallbackKinds: { CI: "Task" } })).toMatch(
			/`repo.labels.fallbackKinds.CI`: "CI" is already in `repo.labels.kinds.ci`/
		);
		expect(problem({ kinds: { bug: "Bug", Bug: "Bug" } })).toMatch(/already in/);
	});

	it("refuses a repository that is not owner/name, and a list that is not a list", () => {
		expect(problem({ repos: ["holocron"] })).toMatch(/`repo.labels.repos` has "holocron"/);
		expect(problem({ repos: [3 as unknown as string] })).toMatch(/has 3/);
		expect(problem({ repos: "a/b" as unknown as string[] })).toMatch(/is a list of/);
	});
});
