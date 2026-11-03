import type { Capability } from "../../config/compose/index.js";

/**
 * Base capability for all theholocron Node.js repositories.
 * Contributes: GitHub source/CI/issues providers, strict branch protection,
 * and the standard task set, spoken as flat task ids: the `lint` suite's leaves
 * (`lint:code`, `lint:editorconfig`, `lint:markdown`, `lint:data`, `lint:commits`),
 * `format`, `scan:secrets`, `test:unit`, `scan:code`, `annotate`, `mark-stale`,
 * `greet`, `update-deps` and `label`. Does NOT include typecheck — add that separately.
 * The gating tasks (lint leaves, `format`, `scan:secrets`, `test:unit`) are marked
 * `required` — `holocron setup` derives their branch-protection check contexts from
 * the manifest. A repo overrides a task by listing it again; `compose()` also lets
 * the old dotted name (`verification.unitTests`, …) override the id it became.
 */
export function node(): Capability {
	return {
		id: "node",
		providers: {
			source: "github",
			ci: "github",
			issues: [
				"github",
				{
					labels: {
						inProgress: "status:in-progress",
						inReview: "status:in-review",
					},
				},
			],
		},
		repo: {
			protection: "strict",
			properties: {
				lifecycle: "active",
				open_source: true,
				runtime_environment: "node",
				uses_external_packages: true,
			},
		},
		tasks: [
			{ name: "lint:code", required: true },
			{ name: "lint:editorconfig", required: true },
			{ name: "lint:markdown", required: true },
			{ name: "format", required: true },
			{ name: "lint:data", required: true },
			{ name: "scan:secrets", required: true },
			{ name: "lint:commits", required: true },
			{ name: "test:unit", required: true },
			"scan:code",
			"annotate",
			"mark-stale",
			"greet",
			"update-deps",
			"label",
		],
	};
}
