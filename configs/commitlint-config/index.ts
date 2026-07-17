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
	},
} satisfies UserConfig;

export default config;
