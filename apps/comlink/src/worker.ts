import { createRelay } from "./relay/relay.js";
import { cloudflare } from "./sources/cloudflare/cloudflare.js";
import { sentry } from "./sources/sentry/sentry.js";

/** Comlink: one Worker, one route per source (`/sentry`, `/cloudflare`). More sources are more entries in this list. */
export default { fetch: createRelay([sentry, cloudflare]) };
