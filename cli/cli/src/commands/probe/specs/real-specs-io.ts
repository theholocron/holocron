import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import type { SpecsIo } from "./specs.type.js";

/** The `specs check` probe's inputs from the real filesystem under `repoRoot`. */
export function realSpecsIo(repoRoot: string): SpecsIo {
	/* v8 ignore start -- reads the real filesystem; the probe is tested with an injected io */
	return {
		list: (dir) => {
			try {
				return readdirSync(join(repoRoot, dir));
			} catch {
				return [];
			}
		},
		read: (path) => {
			try {
				return readFileSync(join(repoRoot, path), "utf8");
			} catch {
				return undefined;
			}
		},
		repoPath: (arg) => relative(repoRoot, resolve(arg)).split("\\").join("/"),
	};
	/* v8 ignore stop */
}
