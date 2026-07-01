/**
 * @see https://commitlint.js.org/reference/configuration.html
 * @type {import("@commitlint/types").UserConfig}
 */
const config = {
	extends: ["@theholocron"],
	rules: {
		"footer-max-line-length": [0],
	},
};

export default config;
