/**
 * @see https://github.com/lint-staged/lint-staged?tab=readme-ov-file#configuration
 * @type {import("lint-staged").Config}
 */
export default {
	"*.{ts,tsx,js,jsx}": [
		"prettier --write",
		"eslint",
		"tsc --noEmit --showConfig",
	],
	"*.css": "stylelint --fix",
	"*.scss": "stylelint --syntax=scss --fix",
	"*.{png,jpeg,jpg,gif,svg}": "imagemin-lint-staged",
	"package.json": "sort-package-json",
};
