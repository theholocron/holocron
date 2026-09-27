import type { Linter } from "eslint";

import { base } from "../configs/base.js";
import { node } from "../configs/node.js";
import { packageJson } from "../configs/package-json.js";
import { typescript } from "../configs/typescript.js";
import { vitest } from "../configs/vitest.js";

export function nodeApp(): Linter.Config[] {
	return [...base(), ...node(), ...typescript(), ...vitest(), ...packageJson()];
}
