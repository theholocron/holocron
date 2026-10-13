#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-checkly against
 * a live Checkly account.
 *
 * READ-ONLY BY DESIGN. Never calls ensureCheck (it creates/updates a
 * real check). Any ERROR line means the plugin needs adjusting — the
 * `hintFor` helper below points at the most likely fix per error shape.
 *
 * Auth: reads the Checkly token from holocron's keyring —
 * you must have run `pnpm holocron auth set checkly <TOKEN>` first.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-checkly validate <accountId>
 */

import { errorMessage } from "@theholocron/misc-utils";

import { AuthError, createChecklyRestClient, resolveToken, verifyToken } from "../src/index.ts";

const [accountId] = process.argv.slice(2);

if (!accountId) {
	console.error("usage: pnpm --filter @theholocron/holocron-plugin-checkly validate <accountId>");
	process.exit(2);
}

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: plugins/holocron-plugin-checkly/README.md#auth");
		process.exit(2);
	}
	throw err;
}

console.log("Validating @theholocron/holocron-plugin-checkly (READ-ONLY)");
console.log("");

// ── 1. verifyToken ─────────────────────────────────────────────────
console.log("[1/2] verifyToken");
const verifyResult = await verifyToken(token);
console.log(`      ${verifyResult.ok ? "✓" : "✗"} ${JSON.stringify(verifyResult)}`);
if (!verifyResult.ok) {
	const hint = hintFor(verifyResult.message);
	if (hint) console.log(`         hint: ${hint}`);
}
console.log("");

// ── 2. list checks for the given account ────────────────────────────
console.log("[2/2] GET /checks (limit 1) against the given accountId");
await runStep(async () => {
	const rest = createChecklyRestClient({ token, accountId });
	const checks = await rest.request("/checks", { query: { limit: "1" } });
	console.log(`      ✓ account reachable (${Array.isArray(checks) ? checks.length : 0} check(s) returned)`);
});

console.log("");
console.log("Done.");

// ── helpers ────────────────────────────────────────────────────────

/** Wrap a capability call, print ERROR + hint on failure. */
async function runStep(body) {
	try {
		await body();
	} catch (err) {
		const message = errorMessage(err);
		console.log(`      ✗ ERROR: ${message}`);
		const hint = hintFor(message);
		if (hint) console.log(`         hint: ${hint}`);
	}
}

function hintFor(message) {
	if (/→ 401/.test(message)) {
		return "token invalid — regenerate at https://app.checklyhq.com/settings/user/api-keys";
	}
	if (/→ 403/.test(message)) {
		return "token authenticates but lacks scope on this account — confirm the accountId and token belong to the same Checkly account";
	}
	if (/→ 404/.test(message)) {
		return "account not found — double check the accountId argument";
	}
	if (/fetch failed|status: 0|network/i.test(message)) {
		return "network error — check connectivity to https://api.checklyhq.com/v1";
	}
	if (/→ 5\d\d/.test(message)) {
		return "server error — vendor-side. Retry, and check https://status.checklyhq.com if persistent";
	}
	return null;
}
