import { environment } from "@theholocron/env-utils/lookup";
import { ConfigError } from "@theholocron/kyber/config";

import type { AppEnv, AppTarget } from "./app-env.type.js";

/** The environments an app is deployed to, in the order they are written. */
const APP_TARGETS: readonly AppTarget[] = ["production", "preview"];

/**
 * Reads the `--env` of `deploy <app>` and `sync <app>`: the standard environments of `@theholocron/env-utils`
 * (`environment.normalize()`, so `prod` is `production`), the flag repeated for more than one. An app is deployed to
 * `production` and `preview`; production takes its secrets from the `prod` vault layer and preview from the `preview`
 * layer (`appLayer()`), with no fallback between them. Any other environment is refused with
 * the reason: `local`, `development` and `ci` are never synced or deployed to, and `test` has no deployment target.
 *
 * @param values - The `--env` (or `--environment`) values, one or several.
 * @throws {ConfigError} For no value, an unknown name or an environment an app is not deployed to.
 */
export function parseAppEnv(values: readonly string[] | string | undefined): AppEnv {
	const given = (values === undefined ? [] : [values].flat()).filter((value) => value !== "");
	if (given.length === 0) {
		throw new ConfigError(
			"pass --env production or --env preview (repeat the flag for both) to say where to write"
		);
	}
	const wanted = new Set<AppTarget>();
	for (const value of given) {
		const normalized = environment.normalize(value);
		if (normalized === undefined) {
			throw new ConfigError(`unknown --env "${value}" (accepted: ${APP_TARGETS.join(", ")})`);
		}
		if (normalized !== "production" && normalized !== "preview") {
			throw new ConfigError(
				`--env ${value} is not an environment an app is deployed or synced to (accepted: ${APP_TARGETS.join(", ")}); \`sync secrets --env ci\` fills GitHub Actions`
			);
		}
		wanted.add(normalized);
	}
	return { targets: APP_TARGETS.filter((target) => wanted.has(target)) };
}
