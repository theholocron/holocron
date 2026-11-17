import { spawnSync } from "node:child_process";

import type { Run } from "./default-run.type.js";

export const defaultRun: Run = (command, args, opts) => spawnSync(command, args, { encoding: "utf8", ...opts });
