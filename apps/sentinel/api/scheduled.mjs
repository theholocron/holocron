/**
 * Vercel Function entry point for the cron entries in `vercel.json` (`/api/scheduled?task=<id>`, spec
 * `tech-sentinel-scheduled-dispatch`, #2609): the thin adapter `handleScheduledRequest` itself has none. GitHub starts a
 * `schedule` workflow late or drops it when it is busy, so Vercel's cron calls this and Sentinel asks GitHub to run the
 * workflow (`workflow_dispatch`). Vercel sends `Authorization: Bearer <CRON_SECRET>`; the handler refuses anything else.
 *
 * `.mjs` and `../dist/index.mjs` for the same reasons as `webhook.mjs`.
 */

import { handleScheduledRequest } from "../dist/index.mjs";

export default {
	fetch(request) {
		return handleScheduledRequest(request, process.env);
	},
};
