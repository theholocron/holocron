import type { Environment } from "./environment.js";
import { environment } from "./environment.js";
import { isCI } from "./is-ci.js";

/**
 * The environment a process is running in: the `ENVIRONMENT` variable when it names one (any case, with the usual
 * spellings such as `production` and `staging`), otherwise `ci` inside CI and `local` anywhere else. Unlike
 * `environment.get()` it reads only `ENVIRONMENT` (not `ENV` or `NODE_ENV`, which many tools set for their own reasons)
 * and never falls back to `prod`, so a laptop is never mistaken for production. `ENVIRONMENT` wins over CI, so a
 * deploy job can say it is `prod`.
 *
 * @example
 * detectEnvironment({ ENVIRONMENT: "production" }); // "production"
 * detectEnvironment({ CI: "true" }); // "ci"
 * detectEnvironment({}); // "local"
 */
export function detectEnvironment(env: Record<string, string | undefined> = process.env): Environment {
	return environment.normalize(env["ENVIRONMENT"] ?? "") ?? (isCI(env) ? "ci" : "local");
}
