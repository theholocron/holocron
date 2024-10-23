/**
 * @see https://github.com/lint-staged/lint-staged?tab=readme-ov-file#configuration
 * @type {import("lint-staged").Config}
 */
const config = {
	"*.css": "stylelint --fix",
	"*.{js,jsx}": ["prettier --write", "eslint"],
	"*.md": ["prettier --write"], // disabling alex --why because of https://github.com/get-alex/alex/issues/348
	"*.mdx": ["prettier --write", "alex --mdx --why"],
	"*.{png,jpeg,jpg,gif,svg}": "imagemin-lint-staged",
	"*.scss": "stylelint --syntax=scss --fix",
	"*.{ts,tsx}": ["prettier --write", "eslint", "tsc --noEmit --showConfig"],
	"package.json": "sort-package-json",
};

export default config;
