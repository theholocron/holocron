import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { coverageExpectations } from "./coverage-expectations.js";

function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "coverage-expectations-"));
	writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "clients/*"\n  - "docs"\n');
	for (const [dir, name] of [
		["clients/b-client", "@x/b-client"],
		["clients/a-client", "@x/a-client"],
		["docs", "@x/docs"],
	] as const) {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name }));
	}
	return root;
}

describe("coverageExpectations", () => {
	it("lists a flag per package but none for docs, and a component for every package, sorted", () => {
		const found = coverageExpectations(workspace());
		expect(found.flags).toEqual(["a-client", "b-client"]);
		expect(found.components).toEqual(["a-client", "b-client", "docs"]);
	});

	it("adds the documentation flag unless docs coverage is off", () => {
		const root = workspace();
		expect(coverageExpectations(root, "off").flags).not.toContain("documentation");
		expect(coverageExpectations(root, "warn").flags).toContain("documentation");
		expect(coverageExpectations(root, "required").flags).toEqual(["a-client", "b-client", "documentation"]);
	});

	it("is empty for a folder with no packages", () => {
		const root = mkdtempSync(join(tmpdir(), "coverage-expectations-empty-"));
		expect(coverageExpectations(root)).toEqual({ flags: [], components: [] });
	});
});
