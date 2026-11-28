import type { Linter } from "eslint";

import { base } from "../configs/base.js";
import { cypress } from "../configs/cypress.js";
import { next } from "../configs/next.js";
import { packageJson } from "../configs/package-json.js";
import { react } from "../configs/react.js";
import { storybook } from "../configs/storybook.js";
import { typescript } from "../configs/typescript.js";
import { vitest } from "../configs/vitest.js";

/**
 * The ESLint bundle for a Next.js application: the base, TypeScript, React, Storybook, Cypress, Next.js and Vitest
 * rules, plus the `package.json` rules.
 */
export function nextApp(): Linter.FlatConfig[] {
	return [
		...base(),
		...typescript(),
		...react(),
		...next(),
		...vitest(),
		...storybook(),
		...cypress(),
		...packageJson(),
	];
}
