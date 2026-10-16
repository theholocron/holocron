import { existsSync } from "node:fs";
import { join } from "node:path";

/** `plugins/` — vendor capability providers, split from `packages/` as a sibling workspace root (#993). */
export function hasPluginsDir(cwd: string): boolean {
	return existsSync(join(cwd, "plugins"));
}
