import type { Linter } from "eslint";

import { base } from "../configs/base.js";
import { packageJson } from "../configs/package-json.js";
import { react } from "../configs/react.js";
import { storybook } from "../configs/storybook.js";
import { typescript } from "../configs/typescript.js";
import { vitest } from "../configs/vitest.js";

export function reactApp(): Linter.Config[] {
	return [...base(), ...typescript(), ...react(), ...storybook(), ...vitest(), ...packageJson()];
}
