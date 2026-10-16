/**
 * `@theholocron/env-utils/lookup` — env lookups with no side effects.
 *
 * The package entry also exports `DotenvLoader`, whose module runs
 * `import "dotenv/config"` and so loads `.env` into `process.env` on import.
 * Import from this subpath instead when you only need to read variables, for
 * example in a library that must not touch the environment of its consumers.
 */

export type { EnvLookup } from "./create-env-lookup.js";
export { createEnvLookup } from "./create-env-lookup.js";
export { firstEnv } from "./first-env.js";
export { withEnvPrefix } from "./with-env-prefix.js";
