import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isGenerated } from "./is-generated.js";
import { isScanned } from "./is-scanned.js";
import type { TasksIo } from "./tasks.type.js";

/** The `tasks names` probe's inputs from the tracked files under `repoRoot`. */
export function realTasksIo(repoRoot: string): TasksIo {
	/* v8 ignore start -- reads git and the real filesystem; the probe is tested with an injected io */
	return {
		files: () =>
			execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
				.split("\0")
				.filter((path) => path !== "" && isScanned(path))
				.flatMap((path) => {
					try {
						const text = readFileSync(join(repoRoot, path), "utf8");
						return isGenerated(text) ? [] : [{ path, text }];
					} catch {
						return [];
					}
				}),
	};
	/* v8 ignore stop */
}
