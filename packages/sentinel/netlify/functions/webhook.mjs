/**
 * Netlify Function entry point — the thin adapter `handleWebhookRequest`
 * itself deliberately doesn't have (see `src/handler.ts`'s own
 * docstring: "a thin per-platform adapter... is the still-open
 * PR-stack item"). Unlike Vercel's `api/webhook.mjs` (whose Node.js
 * runtime calls a `fetch(request)` export directly with a real
 * `Request`/`Response` pair), Netlify's raw digest-deploy API only
 * supports the classic Lambda/API-Gateway handler convention —
 * confirmed live (`@theholocron/netlify-client`'s own README): a
 * `(Request) => Response`-style default export deploys without error
 * but fails at invoke time with `Runtime.HandlerNotFound`. This file
 * is the translation layer that style needs.
 *
 * `.mjs`, not `.js`: no `package.json` ships inside the function's own
 * zip at all (nothing for Netlify to install server-side — see
 * `scripts/stage-deploy-netlify.mjs`), so there's nothing to set
 * `"type": "module"` at this file's directory level otherwise; `.mjs`
 * signals ESM on its own, same reasoning the Vercel entry point's own
 * comment already gives for the same extension choice there.
 *
 * The zip's entry file basename must exactly match the function name
 * ("webhook") — confirmed live, `@theholocron/netlify-client`'s own
 * README. `../../dist/index.mjs`: a relative import to exactly what
 * `stage-deploy-netlify.mjs` zips in alongside this file, not whatever
 * the latest published npm version happens to be — same reasoning the
 * Vercel entry point's own comment gives for its own relative import.
 *
 * Plain JS, not TypeScript: this file is copied verbatim into the
 * deploy zip (`stage-deploy-netlify.mjs`), never compiled — same
 * convention as `api/webhook.mjs`, and why `tsconfig.json`'s `include`
 * only covers `.ts` files under `src`.
 */

import { handleWebhookRequest } from "../../dist/index.mjs";

/**
 * Netlify's classic function event — the HTTP-triggered subset
 * (API-Gateway-proxy shape) this handler actually reads.
 * @param {{ httpMethod: string, path: string, headers: Record<string, string | undefined>, body: string | null, isBase64Encoded: boolean }} event
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
export async function handler(event) {
	const headers = new Headers();
	for (const [key, value] of Object.entries(event.headers)) {
		if (value !== undefined) headers.set(key, value);
	}
	const body = event.body == null ? undefined : event.isBase64Encoded ? atob(event.body) : event.body;
	const host = event.headers.host ?? "sentinel.theholocron.dev";
	const request = new Request(`https://${host}${event.path}`, {
		method: event.httpMethod,
		headers,
		body,
	});

	const response = await handleWebhookRequest(request, process.env);
	return {
		statusCode: response.status,
		headers: Object.fromEntries(response.headers),
		body: await response.text(),
	};
}
