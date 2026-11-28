import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { PromoteIo } from "../run-ideas-promote/index.js";

/** {@link PromoteIo} over the real disk. A file is never overwritten (`wx`), even if one appears between the check and the write. */
export const realPromoteIo: PromoteIo = {
	exists: (path) => existsSync(path),
	write: (path, content) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
	},
};
