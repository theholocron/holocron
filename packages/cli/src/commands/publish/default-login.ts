import { spawnSync } from "node:child_process";

import type { RunPublishInput } from "./run-publish/index.js";

/**
 * Fully interactive — `npm login --auth-type=web` prints a URL and waits for
 * the browser flow to complete; the operator needs to see that live, so all
 * three stdio streams are inherited (unlike `defaultExec`, which pipes
 * stdout/stderr for capture).
 */
export const defaultLogin: NonNullable<RunPublishInput["login"]> = async (cwd) => {
	const result = spawnSync("npm", ["login", "--auth-type=web"], { cwd, stdio: "inherit" });
	return { exitCode: result.status ?? -1 };
};
