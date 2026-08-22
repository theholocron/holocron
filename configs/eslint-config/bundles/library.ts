import { base } from "../configs/base.js";
import { node } from "../configs/node.js";
import { packageJson } from "../configs/package-json.js";
import { typescript } from "../configs/typescript.js";

export function library() {
	return [
		...base(),
		...node(),
		...typescript(),
		...packageJson(),
		{
			name: "@theholocron/library",
			rules: {
				// Library packages often include dev scripts with shebangs that aren't
				// bin entries, and CLI entry shebangs are commonly injected by bundlers
				// (e.g. tsdown banner) rather than written in source. The hashbang rule
				// produces false positives in both cases for the library use-case.
				"n/hashbang": "off",
				// tsdown compiles src/ → dist/ and package.json#files lists dist/ only.
				// Every relative src/ import is therefore flagged as unpublished — a
				// universal false positive for the TypeScript src→dist build model.
				"n/no-unpublished-import": "off",
			},
		},
	];
}
