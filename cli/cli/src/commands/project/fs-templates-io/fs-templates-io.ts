import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { TemplatesIo } from "../load-templates/index.js";

/** The real file system for `loadTemplates`, with a relative directory taken from `repoRoot`. A missing directory is empty. */
export function createFsTemplatesIo(repoRoot: string): TemplatesIo {
	return {
		async listFiles(dir) {
			try {
				return await readdir(resolve(repoRoot, dir));
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
				throw err;
			}
		},
		readFile: (path) => readFile(resolve(repoRoot, path), "utf8"),
	};
}
