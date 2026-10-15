import { spawnSync } from "node:child_process";

import type { Run, SpawnResult } from "../tasks/deploy-on-release/deploy-on-release.type.js";

export const defaultRun: Run = (command, args, opts) =>
	spawnSync(command, args, { encoding: "utf8", ...opts }) as SpawnResult;
