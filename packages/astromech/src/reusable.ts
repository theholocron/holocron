/**
 * The **reusable** GitHub Actions surface pushed to `theholocron/.github` by
 * `holocron sync-github` — the `workflow_call` implementations and composite
 * actions that every repo's thin callers delegate to.
 *
 * `theholocron/.github` is a **pure sync target**: `.github/workflows/*`,
 * `.github/actions/*` and `workflow-templates/*` there are generated from the
 * `.yml` files in `src/templates/reusable/` and pushed verbatim (with a
 * "do not edit" header). Never hand-edit them in `.github`.
 *
 * Not to be confused with `WORKFLOW_TEMPLATES` in `thin-callers.ts` — those are
 * the *thin-caller bases* written into each consumer repo's `.github/workflows/`.
 */

import autoCommitAction from "./templates/reusable/actions/auto-commit.yml";
import holocronAction from "./templates/reusable/actions/holocron.yml";
import installAction from "./templates/reusable/actions/install.yml";
import setupAction from "./templates/reusable/actions/setup.yml";
import setupNodeAction from "./templates/reusable/actions/setup-node.yml";
import bookkeepingWorkflow from "./templates/reusable/bookkeeping.yml";
import bundleSizeWorkflow from "./templates/reusable/delivery.bundleSize.yml";
import deployWorkflow from "./templates/reusable/delivery.deploy.yml";
import publishWorkflow from "./templates/reusable/delivery.publish.yml";
import dependenciesWorkflow from "./templates/reusable/dependencies.yml";
import greetingsWorkflow from "./templates/reusable/greetings.yml";
import wikiWorkflow from "./templates/reusable/knowledge.wiki.yml";
import commitStandardsWorkflow from "./templates/reusable/platform.commitStandards.yml";
import repoSyncWorkflow from "./templates/reusable/platform.repoSync.yml";
import repoValidationWorkflow from "./templates/reusable/platform.repoValidation.yml";
import previewWorkflow from "./templates/reusable/preview.yml";
import reviewWorkflow from "./templates/reusable/review.yml";
import codeScanningWorkflow from "./templates/reusable/security.codeScanning.yml";
import secretDetectionWorkflow from "./templates/reusable/security.secretDetection.yml";
import deadCodeAnalysisWorkflow from "./templates/reusable/sourceQuality.deadCodeAnalysis.yml";
import formattingWorkflow from "./templates/reusable/sourceQuality.formatting.yml";
import staticAnalysisWorkflow from "./templates/reusable/sourceQuality.staticAnalysis.yml";
import structuredDataValidationWorkflow from "./templates/reusable/sourceQuality.structuredDataValidation.yml";
import staleWorkflow from "./templates/reusable/stale.yml";
import syncDispatchWorkflow from "./templates/reusable/sync-dispatch.yml";
import syncGithubWorkflow from "./templates/reusable/sync-github.yml";
import tagWorkflow from "./templates/reusable/tag.yml";
import performanceWorkflow from "./templates/reusable/verification.performance.yml";
import typeSafetyWorkflow from "./templates/reusable/verification.typeSafety.yml";
import unitTestsWorkflow from "./templates/reusable/verification.unitTests.yml";
import { WORKFLOW_TEMPLATES } from "./thin-callers.js";

/** `workflow_call` implementations → `.github/workflows/<name>.yml`. */
export const REUSABLE_WORKFLOWS: Record<string, string> = {
	"verification.unitTests": unitTestsWorkflow,
	"verification.typeSafety": typeSafetyWorkflow,
	"verification.performance": performanceWorkflow,
	"sourceQuality.staticAnalysis": staticAnalysisWorkflow,
	"sourceQuality.formatting": formattingWorkflow,
	"sourceQuality.structuredDataValidation": structuredDataValidationWorkflow,
	"sourceQuality.deadCodeAnalysis": deadCodeAnalysisWorkflow,
	"security.secretDetection": secretDetectionWorkflow,
	"security.codeScanning": codeScanningWorkflow,
	"delivery.publish": publishWorkflow,
	"delivery.deploy": deployWorkflow,
	"delivery.bundleSize": bundleSizeWorkflow,
	"platform.repoSync": repoSyncWorkflow,
	"platform.commitStandards": commitStandardsWorkflow,
	"platform.repoValidation": repoValidationWorkflow,
	"knowledge.wiki": wikiWorkflow,
	bookkeeping: bookkeepingWorkflow,
	dependencies: dependenciesWorkflow,
	preview: previewWorkflow,
	greetings: greetingsWorkflow,
	review: reviewWorkflow,
	stale: staleWorkflow,
	"sync-dispatch": syncDispatchWorkflow,
	tag: tagWorkflow,
	"sync-github": syncGithubWorkflow,
};

/** Composite actions → `.github/actions/<name>/action.yml` (key includes `/action`). */
export const REUSABLE_ACTIONS: Record<string, string> = {
	"auto-commit/action": autoCommitAction,
	"holocron/action": holocronAction,
	"install/action": installAction,
	"setup/action": setupAction,
	"setup-node/action": setupNodeAction,
};

/** GitHub starter-workflow metadata → `workflow-templates/<name>.properties.json`. */
export const WORKFLOW_TEMPLATE_PROPERTIES: Record<string, string> = {
	bookkeeping: JSON.stringify(
		{
			name: "Bookkeeping",
			description: "Label and track issues and pull requests.",
			iconName: "octicon tag",
		},
		null,
		2
	),
};

const SOURCE = "packages/astromech/src/reusable.ts";

/**
 * "AUTO-GENERATED — do not edit" header for the YAML pushed to
 * `theholocron/.github`. Matches `createHeader().workflowHeader({ forPrimary: true })`
 * field-for-field, minus any timestamp — a live `Synced:` line makes the content
 * hash change on every run and defeats `sync-github`'s unchanged-file skip.
 */
function reusableHeader(): string {
	return [
		`# AUTO-GENERATED — do not edit in theholocron/.github directly.`,
		`# Source:  theholocron/holocron · ${SOURCE}`,
		`# Tool:    holocron sync-github`,
		`# Changes: edit source in theholocron/holocron`,
		``,
	].join("\n");
}

/**
 * The complete file batch `holocron sync-github` pushes to `theholocron/.github`:
 * path → content. YAML gets the "do not edit" header; the starter-workflow
 * `.properties.json` files are left bare (native JSON, not a commented file).
 */
export function reusableTemplates(): Map<string, string> {
	const out = new Map<string, string>();
	const header = reusableHeader();

	for (const [name, body] of Object.entries(REUSABLE_ACTIONS)) {
		out.set(`.github/actions/${name}.yml`, `${header}${body}`);
	}
	for (const [name, body] of Object.entries(REUSABLE_WORKFLOWS)) {
		out.set(`.github/workflows/${name}.yml`, `${header}${body}`);
	}
	for (const [name, body] of Object.entries(WORKFLOW_TEMPLATES)) {
		out.set(`workflow-templates/${name}.yml`, `${header}${body}`);
		const props = WORKFLOW_TEMPLATE_PROPERTIES[name];
		if (props) out.set(`workflow-templates/${name}.properties.json`, props);
	}

	return out;
}
