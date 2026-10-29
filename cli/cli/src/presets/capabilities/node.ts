import type { Capability } from "../../config/compose/index.js";

/** The org-standard linter set — drives both CI super-linter and `holocron run lint`. */
const ORG_LINTERS = [
	"eslint",
	"prettier",
	"yamllint",
	"actionlint",
	"gitleaks",
	"editorconfig",
	"commitlint",
	"git-merge-conflict-markers",
];

/**
 * Base capability for all theholocron Node.js repositories.
 * Contributes: GitHub source/CI/issues providers, strict branch protection,
 * and the standard workflow set (lint, test, security, review, stale, greetings,
 * dependencies, bookkeeping). Does NOT include typecheck — add that separately.
 * The `lint` task carries the org linter list explicitly so every repo runs the
 * same set (a repo can override with its own `{ name: "lint", linters: [...] }`).
 * `lint` and `test` are marked `required` — `holocron setup` derives their
 * `… / Conclusion` branch-protection check contexts from the manifest.
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
			{ name: "lint", required: true, linters: ORG_LINTERS },
			{ name: "test", required: true },
			"security",
			"review",
			"stale",
			"greetings",
			"dependencies",
			"bookkeeping",
		],
	};
}
