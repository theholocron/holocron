import { describe, expect, it } from "vitest";

import { thinCallerFile } from "../thin-caller-file/index.js";
import { findObsoleteWorkflows } from "./find-obsolete-workflows.js";

const generated = (pkg: string) => thinCallerFile(pkg, "name: annotate\n");

function find(files: Record<string, string>, written: string[] = [], pkgRelPath = ".") {
	return findObsoleteWorkflows({
		workflows: new Map(Object.entries(files)),
		written: new Set(written),
		pkgRelPath,
	});
}

describe("findObsoleteWorkflows", () => {
	it("names a generated file whose task is no longer written", () => {
		expect(
			find({ "ci.annotate.yml": generated("."), "ci.lint-code.yml": generated(".") }, ["ci.lint-code.yml"])
		).toEqual(["ci.annotate.yml"]);
	});

	it("leaves a file this run still writes", () => {
		expect(find({ "ci.lint-code.yml": generated(".") }, ["ci.lint-code.yml"])).toEqual([]);
	});

	it("leaves a hand-maintained file, even one that carries the generated header", () => {
		const text = `# HAND-MAINTAINED\n${generated(".")}`;
		expect(find({ "platform.notifications.yml": text })).toEqual([]);
	});

	it("leaves a file with no generated header", () => {
		expect(find({ "mine.yml": "name: mine\non: push\n" })).toEqual([]);
	});

	it("leaves a file with the header but no source-package line, which predates the marker", () => {
		const text = "# AUTO-GENERATED — do not edit directly.\n# Tool:    holocron sync\n\nname: old\n";
		expect(find({ "old.yml": text })).toEqual([]);
	});

	it("leaves another package's file, so a run for one package never removes the root's", () => {
		const files = { "ci.root.yml": generated("."), "ci.sentinel.yml": generated("apps/sentinel") };
		expect(find(files, [], "apps/sentinel")).toEqual(["ci.sentinel.yml"]);
		expect(find(files, [], ".")).toEqual(["ci.root.yml"]);
	});

	it("ignores a source-package line that is not at the head of the file", () => {
		const text = `# AUTO-GENERATED — do not edit directly.\n\nname: x\n${"# filler\n".repeat(8)}# Source package: .\n`;
		expect(find({ "x.yml": text })).toEqual([]);
	});

	it("sorts the names", () => {
		const files = { "b.yml": generated("."), "a.yml": generated(".") };
		expect(find(files)).toEqual(["a.yml", "b.yml"]);
	});
});
