import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CoverageStatusInput } from "../../plugin/capabilities/index.js";
import { coverageStatusContexts } from "./coverage-status-contexts.js";

function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "coverage-status-contexts-"));
	writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "clients/*"\n');
	for (const name of ["b-client", "a-client"]) {
		mkdirSync(join(root, "clients", name), { recursive: true });
		writeFileSync(join(root, "clients", name, "package.json"), JSON.stringify({ name: `@x/${name}` }));
	}
	return root;
}

function loaderWith(provider: object | undefined) {
	return {
		has: (key: string) => key === "coverage" && provider !== undefined,
		get: () => provider as never,
	};
}

describe("coverageStatusContexts", () => {
	it("is undefined with no coverage provider, so the task runner keeps its default", () => {
		expect(coverageStatusContexts({ loader: loaderWith(undefined), repoRoot: workspace() })).toBeUndefined();
	});

	it("is undefined when the provider does not implement statusContexts", () => {
		expect(coverageStatusContexts({ loader: loaderWith({}), repoRoot: workspace() })).toBeUndefined();
	});

	it("asks the provider with the workspace's components and the docs mode, `off` by default", () => {
		const seen: CoverageStatusInput[] = [];
		const provider = {
			statusContexts: (input: CoverageStatusInput) => {
				seen.push(input);
				return [{ name: "x/patch", required: true }];
			},
		};
		const root = workspace();
		expect(coverageStatusContexts({ loader: loaderWith(provider), repoRoot: root })).toEqual([
			{ name: "x/patch", required: true },
		]);
		coverageStatusContexts({ loader: loaderWith(provider), repoRoot: root, docsCoverage: "required" });
		expect(seen).toEqual([
			{ components: ["a-client", "b-client"], documentation: "off" },
			{ components: ["a-client", "b-client"], documentation: "required" },
		]);
	});
});
