import type { EnvLogger } from "./types.js";

export const ENVIRONMENTS = ["local", "dev", "qa", "prod"] as const;
export const DEFAULT_ENVIRONMENT: Environment = "prod";
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

export const environment = {
	get: getEnvironment,
	normalize: normalizeEnvironment,
	isDeployed: (logger?: Pick<EnvLogger, "warn">) => DEPLOYED_ENVIRONMENTS.has(getEnvironment(logger)),
};

export type Environment = (typeof ENVIRONMENTS)[number];
