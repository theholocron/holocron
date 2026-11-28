import type { spawnSync } from "node:child_process";

/** What {@link loadDevEnv} needs: which 1Password Environment holds the secrets, and which variables must be set. */
export interface LoadDevEnvInput<K extends string = string> {
	/** The name of the 1Password Environment, e.g. `acme/app - dev`. */
	environment: string;
	/** The variables the app cannot start without. Loading throws, naming any that are in neither place. */
	required: readonly K[];
	/** The variables already in the process. These win over the Environment. Defaults to `process.env`. */
	env?: NodeJS.ProcessEnv | undefined;
	/** Runs `op`. Defaults to `spawnSync`. */
	spawn?: typeof spawnSync | undefined;
}

/** The environment the handler is given: the `required` variables, set, and anything else the Environment holds. */
export type DevEnv<K extends string = string> = NodeJS.ProcessEnv & Record<K, string>;
