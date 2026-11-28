import type { Environment } from "./environment.js";
import { environment } from "./environment.js";
import { holocronEnv } from "./holocron-env.js";
import { isCI } from "./is-ci.js";

/**
 * The environment a process is running in: `HOLOCRON_ENVIRONMENT`, else `ENVIRONMENT`, when it names one (any case,
 * with the usual spellings such as `production` and `staging`), otherwise `ci` inside CI and `local` anywhere else.
 * Unlike `environment.get()` it reads only those two names (not `ENV` or `NODE_ENV`, which many tools set for their own
 * reasons) and never falls back to `prod`, so a laptop is never mistaken for production. They win over CI, so a deploy
 * job can say it is `prod`.
 *
 * @example
 * detectEnvironment({ HOLOCRON_ENVIRONMENT: "production" }); // "production"
 * detectEnvironment({ ENVIRONMENT: "production" }); // "production"
 * detectEnvironment({ CI: "true" }); // "ci"
 * detectEnvironment({}); // "local"
 */
export function detectEnvironment(env: Record<string, string | undefined> = process.env): Environment {
	return environment.normalize(holocronEnv(env).get("ENVIRONMENT") ?? "") ?? (isCI(env) ? "ci" : "local");
}
