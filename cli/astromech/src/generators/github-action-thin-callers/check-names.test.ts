import { describe, expect, it } from "vitest";

import { REUSABLE_WORKFLOWS } from "../github-action-reusable-workflows/index.js";
import { WORKFLOW_CHECK_CONTEXTS, WORKFLOW_TEMPLATES } from "./github-action-thin-callers.js";

/**
 * Required checks are matched by string, and a reusable's check is `<caller job name> / <called job name>`. These tests
 * derive every name from the templates and pin it, so a rename, or a move of a reusable that changes a job name, fails
 * here before it blocks merges in every repo (tracking issue #1476, spec `tech-workflows-in-holocron`).
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

/** The reusable workflow a `uses:` reference calls, by template key. */
function reusableKey(uses: string): string {
	const match = uses.match(/\/workflows\/([^@]+)\.yml@/);
	if (!match) throw new Error(`not a reusable workflow reference: ${uses}`);
	return match[1]!;
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

/**
 * The check names of every task today. Change an entry only with a migration for the required contexts of every repo
 * (rulesets match these strings), never as a side effect of moving a file.
 */
const EXPECTED_CHECK_NAMES: Record<string, string[]> = {
	bookkeeping: ["Bookkeeping / Apply Labels"],
	"delivery.build": ["Build / Build every workspace"],
	"delivery.bundleSize": ["Audit the Bundle Size / Upload bundle stats to Codecov"],
	"delivery.deploy": ["Deploy / Deploy"],
	"delivery.previewCheck": ["Preview Check / Run monitoring checks against the preview deployment"],
	"delivery.previewDeploy": ["Preview Deploy / Deploy preview", "Preview Deploy / Report deployment status"],
	"delivery.publish": ["Release / Semantic release", "Release / Deploy", "Release / Post-release readme sync"],
	dependencies: ["Dependencies / Update the dependencies"],
	greetings: ["Greetings / Greet first-time contributors"],
	"knowledge.wiki": ["Publish / Publish to Fern", "Preview / Publish to Fern"],
	"platform.commitStandards": ["Commit Standards / Run commitlint"],
	"platform.notifyCheck": ["Notify Check / Check ${{ matrix.channel.name }}"],
	"platform.repoSync": ["Sync / Run holocron repo sync", "Sync / Notify of a failed sync"],
	"platform.repoValidation": [
		"Repo Validation / Validate ADRs and specs",
		"Repo Validation / Validate docs presence",
		"Repo Validation / Conclusion",
	],
	"platform.syncTemplates": ["Sync Templates / Run holocron sync github"],
	preview: ["Preview / Preview", "Preview / Clean up Preview"],
	review: ["Annotations / Post inline lint annotations"],
	"security.codeScanning": ["Code Scanning / Analyze (${{ inputs.language }})"],
	"security.secretDetection": ["Secret Detection / Run gitleaks"],
	"security.tokenExpiry": ["Token Expiry / Run holocron doctor tokens"],
	"sourceQuality.deadCodeAnalysis": ["Dead Code Analysis / Run knip"],
	"sourceQuality.formatting": ["Formatting / Run prettier, editorconfig-checker, markdownlint"],
	"sourceQuality.staticAnalysis": ["Static Analysis / Run eslint and actionlint"],
	"sourceQuality.structuredDataValidation": ["Structured Data Validation / Run yamllint"],
	stale: ["stale / Mark stale issues and pull requests"],
	"verification.performance": ["Audit the Performance / Run Lighthouse CI"],
	"verification.typeSafety": ["Typecheck / Run tsc --noEmit"],
	"verification.unitTests": [
		"Test / Run unit tests and collect coverage",
		"Test / Run Storybook interaction tests",
		"Test / Run interactions and accessibility tests",
		"Test / Run user flow tests",
		"Test / Conclusion",
	],
	"verification.visualRegression": ["Visual Regression / Run visual and composition tests"],
};

/** The workflow `name:` of every caller, the run name each repo sees. */
const EXPECTED_WORKFLOW_NAMES: Record<string, string> = {
	bookkeeping: "Platform",
	"delivery.build": "Delivery",
	"delivery.bundleSize": "Delivery",
	"delivery.deploy": "Delivery",
	"delivery.previewCheck": "Delivery",
	"delivery.previewDeploy": "Delivery",
	"delivery.publish": "Delivery",
	dependencies: "Platform",
	greetings: "Platform",
	"knowledge.wiki": "Knowledge",
	"platform.commitStandards": "Platform",
	"platform.notifyCheck": "Platform",
	"platform.repoSync": "Platform",
	"platform.repoValidation": "Platform",
	"platform.syncTemplates": "Platform",
	preview: "Preview",
	review: "Source Quality",
	"security.codeScanning": "Security",
	"security.secretDetection": "Security",
	"security.tokenExpiry": "Token Expiry",
	"sourceQuality.deadCodeAnalysis": "Source Quality",
	"sourceQuality.formatting": "Source Quality",
	"sourceQuality.staticAnalysis": "Source Quality",
	"sourceQuality.structuredDataValidation": "Source Quality",
	stale: "Stale",
	"verification.performance": "Verification",
	"verification.typeSafety": "Verification",
	"verification.unitTests": "Verification",
	"verification.visualRegression": "Visual Regression",
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

	it("posts every required context", () => {
		for (const [task, context] of Object.entries(WORKFLOW_CHECK_CONTEXTS)) {
			expect(checkNames(task), `${task} must post "${context}"`).toContain(context);
		}
	});

	it("keeps each caller's workflow name", () => {
		// A check is named by the caller's job, not its workflow, but a workflow rename still changes the run name that
		// every repo sees.
		const actual = Object.fromEntries(tasks.map((task) => [task, workflowName(WORKFLOW_TEMPLATES[task]!)]));
		expect(actual).toEqual(EXPECTED_WORKFLOW_NAMES);
	});
});
