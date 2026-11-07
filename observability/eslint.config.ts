import type { Linter } from "eslint";

import root, { noProcessEnv } from "../eslint.config.js";

export default [...root, noProcessEnv, { ignores: ["dist/**", "coverage/**"] }] satisfies Linter.Config[];
