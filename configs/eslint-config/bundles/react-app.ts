import { base } from "../configs/base.js";
import { react } from "../configs/react.js";
import { storybook } from "../configs/storybook.js";
import { typescript } from "../configs/typescript.js";
import { vitest } from "../configs/vitest.js";

export function reactApp() {
	return [
		...base(),
		...typescript(),
		...react(),
		...storybook(),
		...vitest(),
	];
}
