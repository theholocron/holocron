import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SpecsSyncIo } from "./specs-sync.type.js";

/** The `specs sync` command's files, read and written under `repoRoot`. */
export function realSpecsSyncIo(repoRoot: string): SpecsSyncIo {
	/* v8 ignore start -- reads and writes the real filesystem; the command is tested with an injected io */
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
		write: (path, text) => writeFileSync(join(repoRoot, path), text),
	};
	/* v8 ignore stop */
}
