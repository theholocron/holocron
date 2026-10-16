import { spawnSync } from "node:child_process";

import type { RunPublishInput } from "./publish.type.js";

export const defaultExec: NonNullable<RunPublishInput["exec"]> = async (cmd, args, opts) => {
	const result = spawnSync(cmd, args, {
		cwd: opts.cwd,
		encoding: "utf8",
		stdio: ["inherit", "pipe", "pipe"],
	});
	return {
		exitCode: result.status ?? -1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
};
