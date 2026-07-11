/**
 * @see https://github.com/lint-staged/lint-staged?tab=readme-ov-file#configuration
 * @type {import("lint-staged").Config}
 */
const config = {
	"*.css": "stylelint --fix",
	"*.{js,jsx}": ["prettier --write", "eslint"],
	"*.md": ["prettier --write"],
	"*.mdx": ["prettier --write"],
	"*.{png,jpeg,jpg,gif,svg}": "imagemin-lint-staged",
	"*.scss": "stylelint --syntax=scss --fix",
	"*.{ts,tsx}": ["prettier --write", "eslint"],
	"package.json": "sort-package-json",
};

export default config;
