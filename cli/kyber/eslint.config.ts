import type { Linter } from "eslint";

import root, { configPackageJsonRules, noProcessEnv } from "../../eslint.config.js";

export default [
	...root,
	noProcessEnv,
	{ files: ["package.json"], rules: configPackageJsonRules },
	{ ignores: ["dist/**", "coverage/**"] },
] satisfies Linter.Config[];
