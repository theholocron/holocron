/**
 * `@theholocron/env-utils/lookup` — env lookups with no side effects.
 *
 * Neither this subpath nor the package entry reads a `.env` on import; only
 * `DotenvLoader.load()` (and so `createEnvParser`) does. This subpath also does
 * not import `dotenv` at all, so a library that only reads variables needs no
 * dotenv install.
 */

export type { EnvLookup } from "./create-env-lookup.js";
export { createEnvLookup } from "./create-env-lookup.js";
export { firstEnv } from "./first-env.js";
export { withEnvPrefix } from "./with-env-prefix.js";
