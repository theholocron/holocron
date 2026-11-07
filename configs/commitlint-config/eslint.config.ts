import type { Linter } from "eslint";

import root, { noProcessEnv } from "../../eslint.config.js";

// This package keeps its sources at the package root rather than `src/`, so the shared rule's `files` is widened.
export default [
	...root,
	{ ...noProcessEnv, files: ["**/*.ts"] },
	{ ignores: ["dist/**", "coverage/**"] },
] satisfies Linter.Config[];
