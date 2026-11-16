import { cache } from "./cache/cache.js";
import { createTurboRestClient, type TurboClientOptions } from "./utils.js";

export type { TurboCacheState, TurboCacheStatus } from "./cache/cache.js";
export { teamQuery } from "./cache/cache.js";
export type { TurboClientOptions } from "./utils.js";

/** Creates a client for Turborepo's Remote Cache (served by Vercel) with a `cache` group, sharing one REST client. */
export function createTurboClient(opts: TurboClientOptions) {
	const rest = createTurboRestClient(opts);
	return {
		cache: cache(rest),
	};
}

/** The client `createTurboClient()` returns. */
export type TurboClient = ReturnType<typeof createTurboClient>;
