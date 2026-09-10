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
import auditWorkflow from "./templates/reusable/audit.yml";
import bookkeepingWorkflow from "./templates/reusable/bookkeeping.yml";
import dependenciesWorkflow from "./templates/reusable/dependencies.yml";
import deployWorkflow from "./templates/reusable/deploy.yml";
import greetingsWorkflow from "./templates/reusable/greetings.yml";
import lintWorkflow from "./templates/reusable/lint.yml";
import previewWorkflow from "./templates/reusable/preview.yml";
import releaseWorkflow from "./templates/reusable/release.yml";
import reviewWorkflow from "./templates/reusable/review.yml";
import securityWorkflow from "./templates/reusable/security.yml";
import staleWorkflow from "./templates/reusable/stale.yml";
import syncWorkflow from "./templates/reusable/sync.yml";
import syncDispatchWorkflow from "./templates/reusable/sync-dispatch.yml";
import syncGithubWorkflow from "./templates/reusable/sync-github.yml";
import tagWorkflow from "./templates/reusable/tag.yml";
import testWorkflow from "./templates/reusable/test.yml";
import typecheckWorkflow from "./templates/reusable/typecheck.yml";
import wikiWorkflow from "./templates/reusable/wiki.yml";
import { WORKFLOW_TEMPLATES } from "./thin-callers.js";

/** `workflow_call` implementations → `.github/workflows/<name>.yml`. */
export const REUSABLE_WORKFLOWS: Record<string, string> = {
	audit: auditWorkflow,
	bookkeeping: bookkeepingWorkflow,
	dependencies: dependenciesWorkflow,
	deploy: deployWorkflow,
	preview: previewWorkflow,
	security: securityWorkflow,
	greetings: greetingsWorkflow,
	lint: lintWorkflow,
	release: releaseWorkflow,
	review: reviewWorkflow,
	stale: staleWorkflow,
	"sync-dispatch": syncDispatchWorkflow,
	tag: tagWorkflow,
	"sync-github": syncGithubWorkflow,
	sync: syncWorkflow,
	test: testWorkflow,
	typecheck: typecheckWorkflow,
	wiki: wikiWorkflow,
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
