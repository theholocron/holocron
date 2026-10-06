#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-netlify against
 * a live Netlify account.
 *
 * READ-ONLY BY DESIGN. Never calls write(), or bootstrap methods
 * (`ensureProject`, `ensureEnvironment`, etc.). Any ERROR line means
 * the plugin needs adjusting — the `hintFor` helper below points at
 * the most likely fix per error shape.
 *
 * Auth: reads the Netlify token from holocron's keyring —
 * you must have run `pnpm holocron auth set netlify <TOKEN>` first.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-netlify validate <arg1> [arg2] ...
 *
 * TODO: replace the positional args below with whatever your
 * capability's methods need (e.g., project id, environment slug,
 * secret name). Adapt the test steps to your capability's method
 * surface. Model on `packages/holocron-plugin-infisical/scripts/validate.mjs`.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- filled in by operator
import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const args = process.argv.slice(2);

if (args.length === 0) {
	console.error("usage: pnpm --filter @theholocron/holocron-plugin-netlify validate <args>");
	process.exit(2);
}

// Use the plugin's own auth resolution so the validate script honors
// the same 4-step precedence as the plugin's runtime:
//   --token → HOLOCRON_NETLIFY_TOKEN → NETLIFY_AUTH_TOKEN → keyring
// (--token isn't available here since this is a bare Node script;
// the other three all work.)
let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: packages/holocron-plugin-netlify/README.md#setup");
		process.exit(2);
	}
	throw err;
}

console.log("Validating @theholocron/holocron-plugin-netlify (READ-ONLY)");
console.log("");

// ── 1. verifyToken ─────────────────────────────────────────────────
console.log("[1/N] verifyToken");
const verifyResult = await verifyToken(token);
console.log(`      ${verifyResult.ok ? "✓" : "✗"} ${JSON.stringify(verifyResult)}`);
if (!verifyResult.ok) {
	const hint = hintFor(verifyResult.message);
	if (hint) console.log(`         hint: ${hint}`);
}
console.log("");

// ── 2..N. capability method calls ──────────────────────────────────
// TODO: implement one `runStep`-wrapped call per meaningful read-side
// capability method. Model on the infisical validate.mjs. Never call
// write / ensure* / other mutating paths.
//
// Example:
//   console.log("[2/N] vault.list()");
//   await runStep(async () => {
//       const keys = await vault.list();
//       console.log(`      ✓ ${keys.length} secrets`);
//   });

console.log("Done. Fill in capability method calls above before shipping.");

// ── helpers ────────────────────────────────────────────────────────

/** Wrap a capability call, print ERROR + hint on failure. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called once a real capability check replaces the TODO example above
async function runStep(body) {
	try {
		await body();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.log(`      ✗ ERROR: ${message}`);
		const hint = hintFor(message);
		if (hint) console.log(`         hint: ${hint}`);
	}
}

/**
 * Point the operator at the most likely fix based on the error shape.
 * Generic defaults below — CUSTOMIZE per your vendor's docs URLs and
 * common permission/config gotchas.
 */
function hintFor(message) {
	if (/→ 401/.test(message)) {
		return "token invalid — regenerate per Netlify's docs (see README §Setup)";
	}
	if (/→ 403/.test(message)) {
		return "token authenticates but lacks scope — check the token/identity has permissions on the resource";
	}
	if (/→ 404/.test(message)) {
		return "endpoint or resource not found — verify your positional args match a real resource";
	}
	if (/fetch failed|status: 0|network/i.test(message)) {
		return "network error — check the base URL (https://api.netlify.com/api/v1) and connectivity";
	}
	if (/→ 5\d\d/.test(message)) {
		return "server error — vendor-side. Retry, and check the vendor's status page if persistent";
	}
	return null;
}
