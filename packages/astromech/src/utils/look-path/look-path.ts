import { join } from "node:path";

import { findExecutableSync } from "@theholocron/fs-utils";

/** `node_modules/.bin/<bin>`, else the first `PATH` entry that has it, else `null`. */
export const realLookPath = (cwd: string, bin: string): string | null =>
	findExecutableSync(bin, { path: join(cwd, "node_modules", ".bin") }) ?? findExecutableSync(bin) ?? null;
