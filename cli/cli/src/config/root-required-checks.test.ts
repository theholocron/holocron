import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
	aggregateChecks,
	codecovComponentBlock,
	codecovUploads,
	readWorkspacePackages,
	requiredChecks,
} from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";
import { describe, expect, it } from "vitest";

import { loadConfig } from "./config-system.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * Every context the per-task required list (no `ci` aggregate) holds, taken from origin/alpha before this guard
 * was added (#1727, audit B6). A change to this list changes branch protection, so it is an explicit edit here, never
 * a side effect of adding a package. The per-package `codecov/patch/<slug>` statuses are deliberately absent: they are
 * informational, and a package a PR does not touch posts no status. The two hand-written checks (`Dependency catalogs /
 * Check`, `Generated files / Check`) became the `validate:deps` and `validate:generated` tasks, which post new contexts.
 */
const PINNED_CONTEXTS = [
	"DCO",
	"build / Build every workspace",
	"codecov/patch",
	"codecov/patch/documentation",
	"codecov/project",
	"lint:code / Run eslint, actionlint and prettier",
	"lint:commits / Run commitlint",
	"lint:data / Run yamllint",
	"lint:editorconfig / Run editorconfig-checker",
	"lint:markdown / Run markdownlint",
	"lint:unused / Run knip",
	"measure-bundle / Upload bundle stats to Codecov",
	"scan:secrets / Run gitleaks",
	"test:unit / Conclusion",
	"typecheck / Run tsc --noEmit",
	"validate:deps / Check dependency catalogs",
	"validate:docs / Validate docs",
	"validate:generated / Check generated files",
	"validate:specs / Validate ADRs and specs",
];

async function rootTasksConfig(): Promise<TasksConfig> {
	const { resolved } = await loadConfig(REPO_ROOT);
	const tasksConfig: TasksConfig = { tasks: resolved.tasks as TasksConfig["tasks"] };
	if (resolved.extraRequiredChecks) tasksConfig.extraRequiredChecks = resolved.extraRequiredChecks;
	return tasksConfig;
}

describe("this repo's required checks (#1727, B6)", () => {
	it("keeps the ruleset to the aggregate and DCO", async () => {
		expect(requiredChecks(await rootTasksConfig(), true)).toEqual(["ci / Required checks", "DCO"]);
	});

	it("derives exactly the per-task contexts it did before, and no codecov context per package", async () => {
		const contexts = requiredChecks(await rootTasksConfig(), false);
		expect([...contexts].sort()).toEqual([...PINNED_CONTEXTS].sort());
	});

	it("writes the aggregate's statuses and ids into ci.ci.yml exactly as derived", async () => {
		const { statuses, expected } = aggregateChecks(await rootTasksConfig());
		expect(statuses).toEqual(["codecov/patch", "codecov/project", "codecov/patch/documentation"]);
		const caller = await readFile(`${REPO_ROOT}.github/workflows/ci.ci.yml`, "utf8");
		expect(caller).toContain(`statuses: '${JSON.stringify(statuses)}'`);
		expect(caller).toContain(`expected: '${JSON.stringify(expected)}'`);
	});

	it("lists a codecov component and a flag for every workspace package in codecov.yml", async () => {
		const packages = readWorkspacePackages(REPO_ROOT);
		const yaml = await readFile(`${REPO_ROOT}codecov.yml`, "utf8");
		expect(yaml).toContain(codecovComponentBlock(packages));
		const ids = [...yaml.matchAll(/^ {4}- component_id: (\S+)/gm)].map((m) => m[1]);
		expect(ids).toEqual(packages.map((p) => p.slug));
		const flags = (JSON.parse(codecovUploads(packages)) as { flag: string }[]).map((u) => u.flag);
		for (const flag of flags) expect(yaml).toContain(`- name: ${flag}`);
	});
});
