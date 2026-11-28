import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CoverageConfigInput } from "../../plugin/capabilities/index.js";
import { coverageConfigFiles } from "./coverage-config-files.js";

function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "coverage-config-files-"));
	writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "clients/*"\n  - "docs"\n');
	for (const dir of ["clients/b-client", "clients/a-client", "docs"]) {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name: `@x/${dir.replace("/", "-")}` }));
	}
	return root;
}

function loaderWith(provider: object | undefined) {
	return {
		has: (key: string) => key === "coverage" && provider !== undefined,
		get: () => provider as never,
	};
}

describe("coverageConfigFiles", () => {
	it("is undefined with no coverage provider, so no coverage config is written", () => {
		expect(coverageConfigFiles({ loader: loaderWith(undefined), repoRoot: workspace() })).toBeUndefined();
	});

	it("is undefined when the provider does not implement configFiles", () => {
		expect(coverageConfigFiles({ loader: loaderWith({}), repoRoot: workspace() })).toBeUndefined();
	});

	it("asks the provider with the workspace's components, its flags (none for docs), the docs mode and a reader", () => {
		const seen: CoverageConfigInput[] = [];
		const provider = {
			configFiles: (input: CoverageConfigInput) => {
				seen.push(input);
				return { "x.yml": "text" };
			},
		};
		const root = workspace();
		writeFileSync(join(root, "x.yml"), "on disk");
		const make = coverageConfigFiles({ loader: loaderWith(provider), repoRoot: root });
		expect(seen).toEqual([]);
		expect(make!()).toEqual({ "x.yml": "text" });
		coverageConfigFiles({ loader: loaderWith(provider), repoRoot: root, docsCoverage: "warn" })!();
		expect(seen[0]).toMatchObject({
			components: [
				{ id: "a-client", path: "clients/a-client" },
				{ id: "b-client", path: "clients/b-client" },
				{ id: "docs", path: "docs" },
			],
			flags: ["a-client", "b-client"],
			documentation: "off",
		});
		expect(seen[1]!.documentation).toBe("warn");
		expect(seen[0]!.existing("x.yml")).toBe("on disk");
		expect(seen[0]!.existing("missing.yml")).toBeNull();
	});
});
