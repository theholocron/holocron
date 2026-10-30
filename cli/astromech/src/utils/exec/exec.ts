import { spawnSync } from "node:child_process";

import type { ExecFn } from "../../tasks/index.js";

/** Runs `cmd` with the parent's stdio; a signal-killed or unspawnable process reports `-1`. */
export const realExec: ExecFn = (cmd, args, opts) => {
	const result = spawnSync(cmd, args, {
		cwd: opts.cwd,
		stdio: "inherit",
		...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
	});
	return { exitCode: result.status ?? -1 };
};
