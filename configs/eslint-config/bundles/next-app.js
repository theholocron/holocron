import { base } from "../configs/base.js";
import { cypress } from "../configs/cypress.js";
import { next } from "../configs/next.js";
import { react } from "../configs/react.js";
import { typescript } from "../configs/typescript.js";
import { storybook } from "../configs/storybook.js";
import { vitest } from "../configs/vitest.js";

export function nextApp() {
	return [
		...base(),
		...typescript(),
		...react(),
		...next(),
		...vitest(),
		...storybook(),
		...cypress(),
	];
}
