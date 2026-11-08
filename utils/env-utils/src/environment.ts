import type { EnvLogger } from "./types.js";

/** The canonical environment names. */
export const ENVIRONMENTS = ["local", "development", "ci", "test", "production"] as const;
/** The environment used when none is set or the value is not recognised: `"production"`. */
export const DEFAULT_ENVIRONMENT: Environment = "production";
/** The environments that count as deployed: `test` and `production`. */
export const DEPLOYED_ENVIRONMENTS = new Set<Environment>(["test", "production"]);

/**
 * Normalize a string into a canonical Environment.
 * Returns undefined if the value is not recognized.
 */
function normalizeEnvironment(value: string): Environment | undefined {
	const aliases = {
		local: "local",

		dev: "development",
		development: "development",

		ci: "ci",

		test: "test",
		stage: "test",
		stg: "test",
		staging: "test",
		qa: "test",

		prod: "production",
		prd: "production",
		production: "production",
	} as const satisfies Record<string, Environment>;
	const lookup = new Map<string, Environment>(Object.entries(aliases));

	return lookup.get(value.trim().toLowerCase());
}

const consoleWarn: Pick<EnvLogger, "warn"> = {
	warn: (message) => console.warn(message),
};

/**
 * Resolve the current environment from input or process.env.
 */
function getEnvironment(logger: Pick<EnvLogger, "warn"> = consoleWarn): Environment {
	const raw =
		process.env["HOLOCRON_ENVIRONMENT"] ||
		process.env["ENVIRONMENT"] ||
		process.env["ENV"] ||
		process.env["NODE_ENV"] ||
		DEFAULT_ENVIRONMENT;
	const normalized = normalizeEnvironment(String(raw));
	if (!normalized) {
		logger.warn(`[@theholocron/utils-env] Unknown environment "${raw}", falling back to "${DEFAULT_ENVIRONMENT}"`);
		return DEFAULT_ENVIRONMENT;
	}
	return normalized;
}

/** Resolves and classifies the current environment. */
export const environment = {
	/** Resolves the environment from `HOLOCRON_ENVIRONMENT`, `ENVIRONMENT`, `ENV` or `NODE_ENV` (first set wins), warning and falling back to the default when the value is not recognised. */
	get: getEnvironment,
	/** Maps a string or alias (`prod`, `prd`, `staging`, `qa`, `dev`, ...) to its canonical {@link Environment}, or `undefined` when it is not recognised. */
	normalize: normalizeEnvironment,
	/** Whether the current environment is a deployed one (`test` or `production`). */
	isDeployed: (logger?: Pick<EnvLogger, "warn">) => DEPLOYED_ENVIRONMENTS.has(getEnvironment(logger)),
};

/** A canonical environment name: `"local"`, `"development"`, `"ci"`, `"test"` or `"production"`. */
export type Environment = (typeof ENVIRONMENTS)[number];
