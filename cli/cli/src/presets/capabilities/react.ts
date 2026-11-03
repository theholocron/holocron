import type { Capability } from "../../config/compose/index.js";

/** Options for the React capability. */
export interface ReactOptions {
	/** Extra `with:` inputs merged into the `test:unit` task entry (e.g. run-chromatic). */
	test?: Record<string, unknown>;
}

/**
 * Adds React/Storybook UI testing and browser runtime config.
 * Contributes: secrets provider, browser runtime property, Storybook + interaction
 * test jobs, `lint:unused` (Knip) + `test:perf` (Lighthouse), and the UI `extraRequiredChecks`.
 * Requires: node, typecheck
 *
 * Pass `test` overrides to merge repo-specific options into the single `test:unit`
 * entry so the sync tool sees one complete entry rather than two
 * conflicting ones:
 *
 * @example
 * compose(node(), typecheck(), react({ test: { "run-chromatic": { projects: [...] } } }))
 */
export function react({ test: testOverrides = {} }: ReactOptions = {}): Capability {
	return {
		id: "react",
		requires: ["node", "typecheck"],
		providers: { secrets: "github" },
		repo: {
			properties: { runtime_environment: "browser", uses_external_packages: false },
		},
		tasks: [
			"lint:unused",
			{ name: "test:perf", with: { "lighthouse-config": "lighthouse.config.cjs" } },
			{
				name: "test:unit",
				with: { "run-unit": false, "run-storybook": true, "run-interaction": true, ...testOverrides },
			},
		],
		// Storybook / lhci job contexts — not manifest tasks. `holocron setup`
		// appends these to the `{ required: true }` task contexts.
		extraRequiredChecks: ["Storybook Publish", "UI Review", "UI Tests", "lhci/url/"],
	};
}
