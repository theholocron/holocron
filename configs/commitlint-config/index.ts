import type { UserConfig } from "@commitlint/types";

/**
 * @see https://commitlint.js.org/reference/configuration.html
 */
const config = {
	extends: ["@commitlint/config-conventional"],
	ignores: [(message: string) => /^chore\(deps(-dev)?\): Bump/.test(message)],
	rules: {
		// Trailers (Co-authored-by, Signed-off-by) are parsed as body text when
		// there is no body paragraph, causing false positives. header-max-length
		// covers the only line length that actually matters for readability.
		"body-max-line-length": [0, "always", Infinity],
		// Every commit in this org carries a Signed-off-by: trailer (`-s` is the
		// standing convention — see AGENTS.md's DCO section) as part of the
		// footer, not the body — same false-positive shape as body-max-line-length
		// above, just for the footer parser instead. Universal, not repo-specific;
		// previously only disabled in theholocron/holocron's own local override.
		"footer-max-line-length": [0],
	},
} satisfies UserConfig;

export default config;
