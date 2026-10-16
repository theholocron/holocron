import { existsSync } from "node:fs";
import { join } from "node:path";

export function hasPackagesDir(cwd: string): boolean {
	return existsSync(join(cwd, "packages"));
}
