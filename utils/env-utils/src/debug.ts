import { environment } from "./environment.js";
import type { EnvLogger, EnvObject } from "./types.js";
import { collectKeys } from "./utils/index.js";

// The module only ever logs `info` with its key list and `warn` with a message alone.
const consoleLogger: EnvLogger = {
	info: (message, meta) => console.info(message, meta),
	warn: (message) => console.warn(message),
};

function isDebugEnabled(): boolean {
	const raw = process.env["DEBUG"];
	if (!raw) return false;
	return ["true", "1", "yes"].includes(raw.toLowerCase());
}

export function debugLog(appName: string, env: EnvObject, logger: EnvLogger = consoleLogger): void {
	if (environment.isDeployed()) return;
	if (!isDebugEnabled()) return;

	const keys = collectKeys(env);
	logger.info(`[@theholocron/utils-env] (debugLog) - ${appName} loaded ${keys.length} key(s) from environment`, {
		keys,
	});
}

export function warnMissingKey(appName: string, key: string, logger: EnvLogger = consoleLogger): void {
	if (environment.isDeployed()) return;
	if (!isDebugEnabled()) return;

	logger.warn(`[@theholocron/utils-env] (warnMissingKey) - ${appName} key not found: "${key}" — returned undefined`);
}

export function debugDeprecation(
	appName: string,
	oldKey: string,
	newKey: string,
	env: EnvObject,
	logger: EnvLogger = consoleLogger
): void {
	if (environment.isDeployed()) return;
	if (!(oldKey in env)) return;

	logger.warn(
		`[@theholocron/utils-env] (debugDeprecation) - ${appName} "${oldKey}" is deprecated; migrate to "${newKey}"`
	);
}

export const debug = {
	log: debugLog,
	deprecate: debugDeprecation,
	warn: warnMissingKey,
};
