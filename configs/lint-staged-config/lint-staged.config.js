/**
 * @see https://github.com/lint-staged/lint-staged?tab=readme-ov-file#configuration
 * @type {import("lint-staged").Config}
 */
export default {
	"*.css": "stylelint --fix",
	"*.{js,jsx}": ["prettier --write", "eslint"],
	"*.md": ["prettier --write", "alex"],
	"*.mdx": ["prettier --write", "alex --mdx --why"],
	"*.{png,jpeg,jpg,gif,svg}": "imagemin-lint-staged",
	"*.scss": "stylelint --syntax=scss --fix",
	"*.{ts,tsx}": ["prettier --write", "eslint", "tsc --noEmit --showConfig"],
	"package.json": "sort-package-json",
};
