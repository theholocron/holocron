import type { Cache } from "@theholocron/cli";

/** What the `token` probe reads from the plugin. */
export interface TokenProbeContext {
	/** The plugin's `cache` capability, whose `checkToken()` the probe reports. */
	cache: () => Cache;
	/** The configured team (`HOLOCRON_TURBO_TEAM`), `undefined` when none is set. Read when the probe runs, so a team read from the `--environment` being checked is found. */
	team: () => string | undefined;
	/** The resolved token, marked secret so it is never printed. Throws an `AuthError` when none is set. */
	token: () => string;
}
