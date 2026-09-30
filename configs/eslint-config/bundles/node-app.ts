import type { Linter } from "eslint";

import { base, docsSrcConfig } from "../configs/base.js";
import { node } from "../configs/node.js";
import { packageJson } from "../configs/package-json.js";
import { typescript } from "../configs/typescript.js";
import { vitest } from "../configs/vitest.js";

// docsSrcConfig re-asserted after node() -- see library.ts's own composition
// for why (node()'s recommended-module preset otherwise clobbers it).
export function nodeApp(): Linter.Config[] {
	return [...base(), ...node(), docsSrcConfig, ...typescript(), ...vitest(), ...packageJson()];
}
