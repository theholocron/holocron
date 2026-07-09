import { base } from "../configs/base.js";
import { node } from "../configs/node.js";
import { typescript } from "../configs/typescript.js";

export function library() {
	return [
		...base(),
		...node(),
		...typescript(),
	];
}
