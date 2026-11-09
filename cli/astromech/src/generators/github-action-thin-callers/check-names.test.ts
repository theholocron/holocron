import { workflowFile } from "@theholocron/ci";
import { describe, expect, it } from "vitest";

import {
	flatFile,
	legacyCaller,
	legacyCallerFile,
	legacyName,
	RESERVED_SCRIPT_NAMES,
	workflowKey,
} from "../../vocabulary/index.js";
import { REUSABLE_WORKFLOWS } from "../github-action-reusable-workflows/index.js";
import { WORKFLOW_CHECK_CONTEXTS, WORKFLOW_TEMPLATES } from "./github-action-thin-callers.js";

/**
 * A reusable's check is `<caller job name> / <called job name>`, and the caller job name is the task id. These tests
 * derive every name from the templates and pin it, so a rename, or a move of a reusable that changes a job name, fails
 * here (tracking issue #1476, spec `tech-workflows-in-holocron`). Only the `ci` aggregate is a required check now, and
 * it waits for the ids that start a check's name, so what must hold is that the workflow, the job and the file are the
 * task id (spec `ci-flat-task-vocabulary`, "The guard test that replaces the grouping test").
 */

interface Job {
	id: string;
	/** The job's `name:`, or its id when it has none (what GitHub shows). */
	name: string;
	uses: string | null;
}

/** The workflow's `name:`. */
function workflowName(yaml: string): string {
	const match = yaml.match(/^name:\s*(.+?)\s*$/m);
	if (!match) throw new Error("workflow has no name:");
	return unquote(match[1]!);
}

function unquote(value: string): string {
	return value.replace(/^(["'])(.*)\1$/, "$2");
}

/** The jobs of a workflow, read from the top-level `jobs:` mapping (two-space job ids, four-space keys). */
function jobsOf(yaml: string): Job[] {
	const body = yaml.split(/^jobs:\s*$/m)[1];
	if (body === undefined) return [];
	const jobs: Job[] = [];
	for (const block of body.split(/^(?= {2}[\w-]+:\s*$)/m)) {
		const id = block.match(/^ {2}([\w-]+):\s*$/m)?.[1];
		if (!id) continue;
		const name = block.match(/^ {4}name:\s*(.+?)\s*$/m)?.[1];
		const uses = block.match(/^ {4}uses:\s*(\S+)/m)?.[1];
		jobs.push({ id, name: name ? unquote(name) : id, uses: uses ?? null });
	}
	return jobs;
}

/** The id of the reusable workflow a `uses:` reference calls, whichever spelling its file name has. */
function reusableKey(uses: string): string {
	const match = uses.match(/\/workflows\/([^@]+\.yml)@/);
	if (!match) throw new Error(`not a reusable workflow reference: ${uses}`);
	const file = flatFile(match[1]!);
	const id = Object.keys(REUSABLE_WORKFLOWS).find((candidate) => workflowFile(candidate) === file);
	if (id === undefined) throw new Error(`no reusable workflow for ${uses}`);
	return id;
}

/** Every check a task's caller posts: `<caller job name> / <called job name>` for each job of the reusable it calls. */
function checkNames(task: string): string[] {
	const names: string[] = [];
	for (const caller of jobsOf(WORKFLOW_TEMPLATES[task]!)) {
		if (!caller.uses) {
			names.push(caller.name);
			continue;
		}
		const reusable = REUSABLE_WORKFLOWS[reusableKey(caller.uses)];
		if (!reusable) throw new Error(`${task}: no reusable workflow for ${caller.uses}`);
		for (const called of jobsOf(reusable)) names.push(`${caller.name} / ${called.name}`);
	}
	return names;
}

/** The check names of every task, the record of what each check is called (not a ruleset guard: only `ci` is required). */
const EXPECTED_CHECK_NAMES: Record<string, string[]> = {
	annotate: ["annotate / Post inline lint annotations"],
	build: ["build / Build every workspace"],
	"check-notify": ["check-notify / Check ${{ matrix.channel.name }}"],
	"check-preview": ["check-preview / Run monitoring checks against the preview deployment"],
	"check-tokens": ["check-tokens / Run holocron doctor tokens"],
	deploy: ["deploy / Deploy"],
	"deploy-preview": ["deploy-preview / Deploy preview", "deploy-preview / Report deployment status"],
	greet: ["greet / Greet first-time contributors"],
	label: ["label / Apply Labels"],
	"lint:code": ["lint:code / Run eslint, actionlint and prettier"],
	"lint:commits": ["lint:commits / Run commitlint"],
	"lint:data": ["lint:data / Run yamllint"],
	"lint:editorconfig": ["lint:editorconfig / Run editorconfig-checker"],
	"lint:markdown": ["lint:markdown / Run markdownlint"],
	"lint:unused": ["lint:unused / Run knip"],
	"mark-stale": ["mark-stale / Mark stale issues and pull requests"],
	"measure-bundle": ["measure-bundle / Upload bundle stats to Codecov"],
	"measure-docs": ["measure-docs / Measure documentation coverage"],
	preview: ["preview / Preview", "preview / Clean up Preview"],
	"publish-wiki": ["publish-wiki / Publish to Fern", "publish-wiki / Publish to Fern"],
	"reconcile-projects": ["reconcile-projects / Reconcile and check the boards"],
	"remind-doctor": ["remind-doctor / Remind to run the drift check"],
	release: ["release / Semantic release", "release / Deploy", "release / Post-release readme sync"],
	"scan:code": ["scan:code / Analyze (${{ inputs.language }})"],
	"scan:secrets": ["scan:secrets / Run gitleaks"],
	"sync-repo": ["sync-repo / Run holocron repo sync", "sync-repo / Notify of a failed sync"],
	"sync-templates": ["sync-templates / Discover consumer repos", "sync-templates / Sync templates"],
	"test:perf": ["test:perf / Run Lighthouse CI"],
	"test:unit": [
		"test:unit / Run unit tests and collect coverage",
		"test:unit / Run Storybook interaction tests",
		"test:unit / Run interactions and accessibility tests",
		"test:unit / Run user flow tests",
		"test:unit / Conclusion",
	],
	"test:visual": ["test:visual / Run visual and composition tests"],
	typecheck: ["typecheck / Run tsc --noEmit"],
	"update-deps": ["update-deps / Update the dependencies"],
	"validate:deps": ["validate:deps / Check dependency catalogs"],
	"validate:generated": ["validate:generated / Check generated files"],
	"validate:docs": ["validate:docs / Validate docs presence"],
	"validate:specs": ["validate:specs / Validate ADRs and specs"],
};

describe("check names of the generated callers", () => {
	const tasks = Object.keys(WORKFLOW_TEMPLATES).sort();

	it("covers every task", () => {
		expect(Object.keys(EXPECTED_CHECK_NAMES).sort()).toEqual(tasks);
	});

	it("pins the check names of every task", () => {
		const actual = Object.fromEntries(tasks.map((task) => [task, checkNames(task)]));
		expect(actual).toEqual(EXPECTED_CHECK_NAMES);
	});

	it("posts every context the aggregate waits on, under the id it waits for", () => {
		for (const [task, context] of Object.entries(WORKFLOW_CHECK_CONTEXTS)) {
			expect(checkNames(task), `${task} must post "${context}"`).toContain(context);
			// `ci` matches a check by the prefix `<id> / `
			expect(context!.startsWith(`${task} / `), `${task}'s context starts with its id`).toBe(true);
		}
	});
});

describe("the workflow, the job and the file are the task id", () => {
	const ids = Object.keys(WORKFLOW_TEMPLATES).sort();

	it("names the workflow and every caller job for the id, and the first job and the file for workflowFile(id)", () => {
		for (const id of ids) {
			const yaml = WORKFLOW_TEMPLATES[id]!;
			const jobs = jobsOf(yaml);
			expect(workflowName(yaml), `${id}: workflow name`).toBe(id);
			expect(
				jobs.map((job) => job.name),
				`${id}: every job name`
			).toEqual(jobs.map(() => id));
			expect(jobs[0]!.id, `${id}: first job id`).toBe(workflowFile(id).replace(/\.yml$/, ""));
			// the other jobs of one caller (the wiki's preview) keep the id as their prefix
			for (const job of jobs.slice(1))
				expect(job.id.startsWith(`${jobs[0]!.id}-`), `${id}: ${job.id}`).toBe(true);
		}
	});

	it("gives every id no dot and no capital, and none a package manager would run as a lifecycle script", () => {
		for (const id of ids) {
			expect(id).toMatch(/^[a-z][a-z0-9]*(?:[-:][a-z0-9]+)*$/);
			expect(RESERVED_SCRIPT_NAMES.has(id), `${id} is a reserved script name`).toBe(false);
		}
	});

	it("has no template for `format`, an action rather than a workflow, and no context: `lint:code` runs it", () => {
		expect(WORKFLOW_TEMPLATES).not.toHaveProperty("format");
		expect(WORKFLOW_CHECK_CONTEXTS).not.toHaveProperty("format");
		expect(workflowKey("format")).toBe("lint:code");
	});

	it("splits the old formatting workflow into one workflow per linter, each posting its own check", () => {
		expect(workflowKey("lint:markdown")).toBe("lint:markdown");
		expect(checkNames("lint:editorconfig")).toEqual(["lint:editorconfig / Run editorconfig-checker"]);
		expect(checkNames("lint:markdown")).toEqual(["lint:markdown / Run markdownlint"]);
	});

	it("files no two ids as one file", () => {
		expect(new Set(ids.map(workflowFile)).size).toBe(ids.length);
	});

	it("keeps the old names for a repo that still calls the frozen reusables (the legacy-name gate)", () => {
		for (const id of ids) {
			const old = legacyCaller(id, WORKFLOW_TEMPLATES[id]!);
			// every id keeps a unique old file, named for the old task (or its own id when it had none)
			expect(legacyCallerFile(id)).toBe(`${legacyName(id) ?? id}.yml`);
			// a legacy caller no longer carries the id as its workflow name
			expect(workflowName(old)).not.toBe(id);
			expect(jobsOf(old).length, `${id}: the same jobs`).toBe(jobsOf(WORKFLOW_TEMPLATES[id]!).length);
		}
	});
});
