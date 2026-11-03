import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { idFromSource, workflowFile } from "@theholocron/ci";
import { describe, expect, it } from "vitest";

import { TASKS } from "../../registry/index.js";
import { LEGACY_NAMES } from "../../vocabulary/index.js";
import { WORKFLOW_TEMPLATES } from "../github-action-thin-callers/index.js";

/** The workflows that are not a leaf of the registry: no suite, no local task, or not run by a repo's own caller. */
const OUTSIDE_THE_REGISTRY = ["ci", "preview", "tag", "sync-dispatch", "sync-github", "check-dispatched"];

const repoRoot = fileURLToPath(new URL("../../../../..", import.meta.url));

/** Every `.yml` under `dir`, as a repo-relative path with forward slashes. */
function ymlFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return ymlFiles(path);
		return entry.name.endsWith(".yml") ? [relative(repoRoot, path).split("\\").join("/")] : [];
	});
}

const sources = ymlFiles(join(repoRoot, "ci", "workflows"));
const workflowOnlyIds = Object.values(LEGACY_NAMES).flatMap((targets) => targets.map((target) => target.id));

describe("the layout of ci/workflows", () => {
	it("has the workflows this test is about", () => {
		expect(sources.length).toBeGreaterThan(30);
	});

	it("maps every source to a unique id, and no two ids flatten to one file", () => {
		const ids = sources.map(idFromSource);
		expect(new Set(ids).size).toBe(ids.length);
		const files = ids.map(workflowFile);
		expect(files.filter((file, index) => files.indexOf(file) !== index)).toEqual([]);
	});

	it("names only workflows that the registry, the workflow-only ids or the hand list know", () => {
		const known = new Set([...Object.keys(TASKS), ...workflowOnlyIds, ...OUTSIDE_THE_REGISTRY]);
		expect(sources.map(idFromSource).filter((id) => !known.has(id))).toEqual([]);
	});

	it("puts a leaf of a suite in its suite's folder, and nothing else in a folder", () => {
		const wrong = sources.filter((source) => {
			const id = idFromSource(source);
			const suite = TASKS[id]?.suite;
			// the folder (everything before the colon) is the suite, or there is none and the id has no colon
			return (id.includes(":") ? id.split(":")[0] : undefined) !== suite;
		});
		expect(wrong).toEqual([]);
	});

	it("keeps every id free of a dot, an uppercase letter and a second folder level", () => {
		for (const id of sources.map(idFromSource)) {
			expect(id).toMatch(/^[a-z0-9-]+(:[a-z0-9-]+)?$/);
		}
	});

	it("has a template for each task source, at the same path under the templates folder", () => {
		const templated = new Set(
			ymlFiles(join(repoRoot, "cli", "astromech", "src", "templates", "workflows")).map(idFromSource)
		);
		const withoutTemplate = sources.map(idFromSource).filter((id) => !templated.has(id));
		// the workflows no repo calls from a thin caller of its own (Sentinel, the org's own syncs and the aggregate)
		expect(withoutTemplate.sort()).toEqual(["check-dispatched", "ci", "sync-dispatch", "sync-github", "tag"]);
		expect(Object.keys(WORKFLOW_TEMPLATES).length).toBe(templated.size);
	});
});
