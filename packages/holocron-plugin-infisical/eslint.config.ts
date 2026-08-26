import type { Linter } from "eslint";

import root from "../../eslint.config.js";

export default [
	...root,
	{ ignores: ["dist/**", "coverage/**"] },
	{ rules: { "package-json/no-workspace-protocol-in-published-package": "off" } },
] satisfies Linter.Config[];
