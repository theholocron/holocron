/**
 * `@theholocron/env-utils/lookup` — env lookups and environment detection with no side effects.
 *
 * The package entry also exports `DotenvLoader`, whose module runs
 * `import "dotenv/config"` and so loads `.env` into `process.env` on import.
 * Import from this subpath instead when you only need to read variables, for
 * example in a library that must not touch the environment of its consumers.
 */

export type { EnvLookup } from "./create-env-lookup.js";
export { createEnvLookup } from "./create-env-lookup.js";
export { detectEnvironment } from "./detect-environment.js";
export type { Environment } from "./environment.js";
export { DEFAULT_ENVIRONMENT, DEPLOYED_ENVIRONMENTS, environment, ENVIRONMENTS } from "./environment.js";
export { firstEnv } from "./first-env.js";
export { holocronEnv, PREFIX } from "./holocron-env.js";
export { isCI } from "./is-ci.js";
export { withEnvPrefix } from "./with-env-prefix.js";
