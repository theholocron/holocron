import { base } from "../configs/base.js";
import { node } from "../configs/node.js";
import { typescript } from "../configs/typescript.js";
import { vitest } from "../configs/vitest.js";

export function nodeApp() {
	return [
		...base(),
		...node(),
		...typescript(),
		...vitest(),
	];
}
