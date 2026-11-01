/**
 * The **reusable** GitHub Actions surface pushed to `theholocron/.github` by
 * `holocron sync github` — the `workflow_call` implementations and composite
 * actions that every repo's thin callers delegate to.
 *
 * `theholocron/.github` is a **pure sync target**: `.github/workflows/*`,
 * `.github/actions/*` and `workflow-templates/*` there are generated from the
 * `.yml` files in `ci/` (`@theholocron/ci`) and pushed verbatim (with a
 * "do not edit" header). Never hand-edit them in `.github`.
 *
 * Not to be confused with `WORKFLOW_TEMPLATES` in `github-action-thin-callers.ts` — those are
 * the *thin-caller bases* written into each consumer repo's `.github/workflows/`.
 */

import { ACTIONS, WORKFLOWS } from "@theholocron/ci";

import { rehomeAll } from "../ci-ref/index.js";
import { WORKFLOW_TEMPLATES, workflowTriggers } from "../github-action-thin-callers/index.js";

/** `workflow_call` implementations → `.github/workflows/<name>.yml`. */
export const REUSABLE_WORKFLOWS: Record<string, string> = rehomeAll(WORKFLOWS);

/**
 * The reusables a repo that hosts them keeps in its own `.github/workflows`, by name: the ones that only run when
 * another workflow calls them. A reusable that is also started by an event or by hand (`tag`, `sync-dispatch`,
 * `platform.dispatchedCheck`) would become a live workflow of the hosting repo, and runs where it is dispatched, so
 * it stays out (spec `tech-workflows-in-holocron`, #1216).
 */
export function hostedReusableWorkflows(): Map<string, string> {
	return new Map(
		Object.entries(REUSABLE_WORKFLOWS).filter(([, text]) => {
			const triggers = workflowTriggers(text);
			return triggers.length === 1 && triggers[0] === "workflow_call";
		})
	);
}

/** Composite actions → `.github/actions/<name>/action.yml` (key includes `/action`). */
export const REUSABLE_ACTIONS: Record<string, string> = rehomeAll(
	Object.fromEntries(Object.entries(ACTIONS).map(([name, text]) => [`${name}/action`, text]))
);

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

const SOURCE = "cli/astromech/src/generators/github-action-reusable-workflows/github-action-reusable-workflows.ts";

/**
 * "AUTO-GENERATED — do not edit" header for the YAML pushed to
 * `theholocron/.github`. Matches `createHeader().workflowHeader({ forPrimary: true })`
 * field-for-field, minus any timestamp — a live `Synced:` line makes the content
 * hash change on every run and defeats `sync github`'s unchanged-file skip.
 */
function reusableHeader(): string {
	return [
		`# AUTO-GENERATED — do not edit in theholocron/.github directly.`,
		`# Source:  theholocron/holocron · ${SOURCE}`,
		`# Tool:    holocron sync github`,
		`# Changes: edit source in theholocron/holocron`,
		``,
	].join("\n");
}

/**
 * The complete file batch `holocron sync github` pushes to `theholocron/.github`:
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
