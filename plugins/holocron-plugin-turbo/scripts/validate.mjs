#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-turbo.
 *
 * READ-ONLY. Runs cache.checkToken(): proves the token is accepted by Vercel and that the remote cache answers for the
 * team (HOLOCRON_TURBO_TEAM / TURBO_TEAM).
 *
 * Usage:
 *   HOLOCRON_TURBO_TEAM=<team> pnpm --filter @theholocron/holocron-plugin-turbo validate:plugin
 */

import { AuthError, createPlugin, resolveToken } from "../src/index.ts";

try {
	resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		process.exit(2);
	}
	throw err;
}

console.log("Validating @theholocron/holocron-plugin-turbo (READ-ONLY)");
const check = await createPlugin().capabilities.cache().checkToken();
console.log(`  ${check.ok ? "✓" : "✗"} ${JSON.stringify(check)}`);
console.log("Done. No writes.");
process.exit(check.ok ? 0 : 1);
