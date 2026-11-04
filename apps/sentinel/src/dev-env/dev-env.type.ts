import type { spawnSync } from "node:child_process";

import type { Env } from "../handler/index.js";

/** What {@link loadDevEnv} needs: which 1Password Environment holds the development App's secrets. */
export interface LoadDevEnvInput {
	/** The name of the 1Password Environment, e.g. `Sentinel - dev`. */
	environment: string;
	/** The variables already in the process. These win over the Environment. Defaults to `process.env`. */
	env?: NodeJS.ProcessEnv | undefined;
	/** Runs `op`. Defaults to `spawnSync`. */
	spawn?: typeof spawnSync | undefined;
}

/** The environment the handler is given: the three it requires, and anything else the Environment holds. */
export type DevEnv = Env;
