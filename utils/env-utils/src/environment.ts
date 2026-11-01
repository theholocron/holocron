import type { EnvLogger } from "./types.js";

/** The canonical environment names. */
export const ENVIRONMENTS = ["local", "dev", "qa", "prod"] as const;
/** The environment used when none is set or the value is not recognised: `"prod"`. */
export const DEFAULT_ENVIRONMENT: Environment = "prod";
/** The environments that count as deployed: `qa` and `prod`. */
export const DEPLOYED_ENVIRONMENTS = new Set<Environment>(["qa", "prod"]);

/**
 * Normalize a string into a canonical Environment.
 * Returns undefined if the value is not recognized.
 */
function normalizeEnvironment(value: string): Environment | undefined {
	const aliases = {
		local: "local",

		dev: "dev",
		development: "dev",

		qa: "qa",
		test: "qa",
		staging: "qa",

		prod: "prod",
		production: "prod",
	} as const satisfies Record<string, Environment>;
	const lookup = new Map<string, Environment>(Object.entries(aliases));

	return lookup.get(value.toLowerCase());
}

const consoleWarn: Pick<EnvLogger, "warn"> = {
	warn: (message) => console.warn(message),
};

/**
 * Resolve the current environment from input or process.env.
 */
function getEnvironment(logger: Pick<EnvLogger, "warn"> = consoleWarn): Environment {
	const raw = process.env["ENVIRONMENT"] || process.env["ENV"] || process.env["NODE_ENV"] || DEFAULT_ENVIRONMENT;
	const normalized = normalizeEnvironment(String(raw));
	if (!normalized) {
		logger.warn(`[@theholocron/utils-env] Unknown environment "${raw}", falling back to "${DEFAULT_ENVIRONMENT}"`);
		return DEFAULT_ENVIRONMENT;
	}
	return normalized;
}

/** Resolves and classifies the current environment. */
export const environment = {
	/** Resolves the environment from `ENVIRONMENT`, `ENV` or `NODE_ENV` (first set wins), warning and falling back to the default when the value is not recognised. */
	get: getEnvironment,
	/** Maps a string or alias (`production`, `staging`, `test`, ...) to its canonical {@link Environment}, or `undefined` when it is not recognised. */
	normalize: normalizeEnvironment,
	/** Whether the current environment is a deployed one (`qa` or `prod`). */
	isDeployed: (logger?: Pick<EnvLogger, "warn">) => DEPLOYED_ENVIRONMENTS.has(getEnvironment(logger)),
};

/** A canonical environment name: `"local"`, `"dev"`, `"qa"` or `"prod"`. */
export type Environment = (typeof ENVIRONMENTS)[number];
