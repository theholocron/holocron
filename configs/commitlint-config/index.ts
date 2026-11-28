import type { UserConfig } from "@commitlint/types";

/**
 * @see https://commitlint.js.org/reference/configuration.html
 */
const config = {
	/** Extends the Conventional Commits rule set from `@commitlint/config-conventional`. */
	extends: ["@commitlint/config-conventional"],
	/** Commit messages commitlint skips entirely: dependency bump commits such as `chore(deps): Bump ...`. */
	ignores: [(message: string) => /^chore\(deps(-dev)?\): Bump/.test(message)],
	/** Rule overrides applied on top of the extended Conventional Commits rules. */
	rules: {
		// Trailers (Co-authored-by, Signed-off-by) are parsed as body text when
		// there is no body paragraph, causing false positives. header-max-length
		// covers the only line length that actually matters for readability.
		/** Turned off (level 0): trailers are parsed as body text when there is no body paragraph, which gives false positives. */
		"body-max-line-length": [0, "always", Infinity],
		// Every commit in this org carries a Signed-off-by: trailer (`-s` is the
		// standing convention — see AGENTS.md's DCO section) as part of the
		// footer, not the body — same false-positive shape as body-max-line-length
		// above, just for the footer parser instead. Universal, not repo-specific;
		// previously only disabled in theholocron/holocron's own local override.
		/** Turned off (level 0): the `Signed-off-by:` trailer sits in the footer and would otherwise trip the line-length check. */
		"footer-max-line-length": [0],
	},
} satisfies UserConfig;

export default config;
