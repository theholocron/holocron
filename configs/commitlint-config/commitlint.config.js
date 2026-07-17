/**
 * @see https://commitlint.js.org/reference/configuration.html
 * @type {import("@commitlint/types").UserConfig}
 */
const config = {
	extends: ["@commitlint/config-conventional"],
	ignores: [(message) => /^chore\(deps(-dev)?\): Bump/.test(message)],
	rules: {
		// Trailers (Co-authored-by, Signed-off-by) are parsed as body text when
		// there is no body paragraph, causing false positives. header-max-length
		// covers the only line length that actually matters for readability.
		"body-max-line-length": [0, "always", Infinity],
	},
};

export default config;
