import { environment } from "./environment.js";
import { collectKeys } from "./utils/index.js";
import type { EnvObject } from "./types.js";

function isDebugEnabled(): boolean {
	const raw = process.env["DEBUG"];
	if (!raw) return false;
	return ["true", "1", "yes"].includes(raw.toLowerCase());
}

export function debugLog(appName: string, env: EnvObject): void {
	if (environment.isDeployed()) return;
	if (!isDebugEnabled()) return;

	const keys = collectKeys(env);
	console.info(
		`[@theholocron/utils-env] (debugLog) - ${appName} loaded ${keys.length} key(s) from environment`,
		{
			keys,
		},
	);
}

export function warnMissingKey(appName: string, key: string): void {
	if (environment.isDeployed()) return;
	if (!isDebugEnabled()) return;

	console.warn(
		`[@theholocron/utils-env] (warnMissingKey) - ${appName} key not found: "${key}" — returned undefined`,
	);
}

export function debugDeprecation(
	appName: string,
	oldKey: string,
	newKey: string,
	env: EnvObject,
): void {
	if (environment.isDeployed()) return;
	if (!(oldKey in env)) return;

	console.warn(
		`[@theholocron/utils-env] (debugDeprecation) - ${appName} "${oldKey}" is deprecated; migrate to "${newKey}"`,
	);
}

export const debug = {
	log: debugLog,
	deprecate: debugDeprecation,
	warn: warnMissingKey,
};
