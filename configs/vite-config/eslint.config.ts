import type { Linter } from "eslint";

import root, { noProcessEnv } from "../../eslint.config.js";

// This package keeps its sources in `presets/` and `index.ts`, not `src/`, so the shared rule's `files` is widened.
export default [
	...root,
	{ ...noProcessEnv, files: ["index.ts", "presets/**/*.ts"] },
	{ ignores: ["dist/**", "coverage/**"] },
] satisfies Linter.Config[];
