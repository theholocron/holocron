/**
 * Uptime check for Sentinel's deployed webhook function
 * (`sentinel.theholocron.dev/api/webhook`) — the single point of
 * failure for every PR check across the org, with nothing today
 * watching whether it's actually up (Sentry/Axiom are reactive —
 * error-on-occurrence and log-aggregation, not "is it reachable").
 *
 * GET on a webhook endpoint can't exercise real webhook-handling logic
 * (that needs a signed POST with a GitHub event body), but
 * `handleWebhookRequest` (`src/handler.ts`) rejects a non-POST request
 * with a clean `405` before touching any webhook-specific logic —
 * confirmed live. That's exactly the right signal for an uptime check:
 * proof the function is deployed and executing routing logic, not a
 * cold crash, a 500, or a timeout. Full business-logic correctness is
 * covered by the existing test suite, not this check.
 */

import { AssertionBuilder } from "checkly/constructs";
import { ApiCheck } from "checkly/constructs";

new ApiCheck("sentinel-webhook-uptime", {
	name: "Sentinel webhook endpoint reachable",
	degradedResponseTime: 5000,
	maxResponseTime: 10000,
	request: {
		url: "https://sentinel.theholocron.dev/api/webhook",
		method: "GET",
		followRedirects: true,
		skipSSL: false,
		assertions: [AssertionBuilder.statusCode().equals(405)],
	},
});
