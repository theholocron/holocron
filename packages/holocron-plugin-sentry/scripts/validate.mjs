#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-sentry.
 *
 * READ-ONLY. Tests verifyToken + observability.whoami + observability.describe
 * — proves auth, org access, and capability wiring.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-sentry validate <org>
 *
 *   org — Sentry organization slug (e.g. "my-org")
 */

import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const [org] = process.argv.slice(2);

if (!org) {
	console.error("usage: pnpm --filter @theholocron/holocron-plugin-sentry validate <org>");
	console.error("  org — your Sentry organization slug (visible in the Sentry URL)");
	process.exit(2);
}

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: packages/holocron-plugin-sentry/README.md#auth");
		process.exit(2);
	}
	throw err;
}

console.log("Validating @theholocron/holocron-plugin-sentry (READ-ONLY)");
console.log(`  org: ${org}`);
console.log("");

console.log("[1/3] verifyToken");
const verifyResult = await verifyToken(token);
console.log(`      ${verifyResult.ok ? "✓" : "✗"} ${JSON.stringify(verifyResult)}`);
if (!verifyResult.ok) {
	const hint = hintFor(verifyResult.message);
	if (hint) console.log(`         hint: ${hint}`);
}
console.log("");

const plugin = createPlugin({ cliToken: token, org });
const obs = plugin.capabilities.observability();

console.log("[2/3] observability.whoami()");
await runStep(async () => {
	const result = await obs.whoami();
	console.log(`      ✓ org: ${result.org}`);
});
console.log("");

console.log("[3/3] observability.describe()");
await runStep(async () => {
	const result = await obs.describe();
	console.log(`      ✓ provider: ${result.provider}`);
	console.log(`        envKeys: ${result.envKeys.join(", ")}`);
});
console.log("");
console.log("Done. No writes.");

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

function hintFor(message) {
	if (/→ 401|→ 403/.test(message))
		return "token invalid or lacks scope — regenerate at https://sentry.io/settings/account/api/auth-tokens/ with org:read + project:read + project:write";
	if (/→ 404/.test(message))
		return "org not found — verify the slug matches your Sentry organization URL";
	if (/fetch failed|status: 0|network/i.test(message)) return "network error — check sentry.io reachable";
	if (/→ 5\d\d/.test(message)) return "server error — check https://status.sentry.io";
	return null;
}
