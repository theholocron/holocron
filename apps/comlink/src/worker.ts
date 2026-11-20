import { createRelay } from "./relay/relay.js";
import { clerk } from "./sources/clerk/clerk.js";
import { cloudflare } from "./sources/cloudflare/cloudflare.js";
import { dependabot } from "./sources/dependabot/dependabot.js";
import { doppler } from "./sources/doppler/doppler.js";
import { sentry } from "./sources/sentry/sentry.js";
import { vercel } from "./sources/vercel/vercel.js";

/** Comlink: one Worker, one route per source (`/sentry`, `/cloudflare`, `/clerk`, `/dependabot`, `/vercel`, `/doppler`). More sources are more entries in this list. */
export default { fetch: createRelay([sentry, cloudflare, clerk, dependabot, vercel, doppler]) };
