/**
 * Vercel Function entry point — the thin adapter `handleWebhookRequest`
 * itself deliberately doesn't have (see `src/handler.ts`'s own
 * docstring: "a thin per-platform adapter... is the still-open
 * PR-stack item"). Vercel's Functions convention: any file under
 * `/api` deploys as a function; the default export's `fetch(request)`
 * is the "fetch Web Standard" handler shape Vercel's Node.js runtime
 * calls directly with a real `Request`, expecting a `Response` back —
 * exactly `handleWebhookRequest`'s own signature, so this adapter has
 * nothing to translate.
 *
 * `.mjs`, not `.js`: there's no `package.json` `"type": "module"` at
 * this file's own directory level in the deployed tree otherwise (see
 * `scripts/stage-deploy.mjs` — the deployed `package.json` does set
 * it, but Vercel's own docs call out `.mjs` as the safer bet for a
 * no-framework function file).
 *
 * `../dist/index.mjs`: a relative import, not `@theholocron/sentinel`
 * — this deploys exactly what was just built locally (`../dist`,
 * staged alongside this file by `stage-deploy.mjs`), not whatever
 * happens to be the latest published npm version.
 */

import { handleWebhookRequest } from "../dist/index.mjs";

export default {
	fetch(request) {
		return handleWebhookRequest(request, process.env);
	},
};
