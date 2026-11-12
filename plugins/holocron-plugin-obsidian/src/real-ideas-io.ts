import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

import type { IdeasIo } from "./ideas-io.type.js";

/** The `sync ideas` inputs from the real filesystem. */
export function realIdeasIo(): IdeasIo {
	/* v8 ignore start -- reads the real filesystem; the command is tested with an injected io */
	return {
		readDir: (path) => {
			try {
				return readdirSync(path, { withFileTypes: true }).map((e) => ({
					name: e.name,
					directory: e.isDirectory(),
				}));
			} catch {
				return undefined;
			}
		},
		read: (path) => {
			try {
				return readFileSync(path, "utf8");
			} catch {
				return undefined;
			}
		},
		write: (path, text) => writeFileSync(path, text, "utf8"),
		home: () => homedir(),
	};
	/* v8 ignore stop */
}
