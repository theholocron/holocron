import type { Linter } from "eslint";

import root from "../../eslint.config.js";

export default [...root, { ignores: ["dist/**", "coverage/**", ".vercel-deploy/**"] }] satisfies Linter.Config[];
