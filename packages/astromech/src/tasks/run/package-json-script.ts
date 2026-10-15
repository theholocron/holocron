import { join } from "node:path";

import { readPackageJsonSync } from "@theholocron/pkg-utils";

/** The `scripts[task]` command in `<cwd>/package.json`, or `undefined` when there is none. */
export function packageJsonScript(
	cwd: string,
	task: string,
	readFile: (p: string) => string,
	fileExists: (p: string) => boolean
): string | undefined {
	if (!fileExists(join(cwd, "package.json"))) return undefined;
	return readPackageJsonSync(cwd, { readFile })?.scripts?.[task];
}
