#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-clerk.
 *
 * READ-ONLY. Tests auth.describe + auth.whoami — the two guaranteed
 * capability methods.
 *
 * NOTE: no keyring / verifyToken yet — uses `--token` →
 * HOLOCRON_CLERK_TOKEN → CLERK_SECRET_KEY only. Auth-modernization
 * follow-up tracked separately.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-clerk validate
 */

import { AuthError, createPlugin, resolveToken } from "../src/index.ts";

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: packages/holocron-plugin-clerk/README.md#auth");
		process.exit(2);
	}
	throw err;
}

console.log("Validating @theholocron/holocron-plugin-clerk (READ-ONLY)");
console.log("");

const plugin = createPlugin({ cliToken: token });
const auth = plugin.capabilities.auth();

console.log("[1/2] auth.describe()");
await runStep(async () => {
	const desc = await auth.describe();
	console.log(`      ✓ provider: ${desc.provider}`);
	console.log(`         env keys: ${desc.envKeys.join(", ")}`);
});
console.log("");

console.log("[2/2] auth.whoami()");
await runStep(async () => {
	const identity = await auth.whoami();
	console.log(`      ✓ provider: ${identity.provider}`);
	if (identity.details) {
		Object.entries(identity.details)
			.slice(0, 5)
			.forEach(([k, v]) => console.log(`         · ${k}: ${String(v)}`));
	}
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
		return "secret key invalid or lacks scope — regenerate at https://dashboard.clerk.com → API Keys (use the SECRET key, not publishable)";
	if (/→ 404/.test(message))
		return "endpoint or resource not found — verify the base URL matches your Clerk instance's API domain";
	if (/fetch failed|status: 0|network/i.test(message)) return "network error — check api.clerk.com reachable";
	if (/→ 5\d\d/.test(message)) return "server error — check https://status.clerk.com";
	return null;
}
