import { createRelay } from "./relay/relay.js";
import { sentry } from "./sources/sentry/sentry.js";

/** Comlink: one Worker, one route per source (`/sentry`). More sources are more entries in this list. */
export default { fetch: createRelay([sentry]) };
