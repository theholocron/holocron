#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-axiom against a
 * live Axiom account. Same convention as the other plugins — see
 * `packages/holocron-plugin-sentry/scripts/validate.mjs`.
 *
 * READ-ONLY. Never calls ensureDataset() or any write.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-axiom validate <dataset>
 *
 *   dataset — an Axiom dataset name to check reachability against
 *             (e.g. "holocron-ci"). Falls back to HOLOCRON_AXIOM_DATASET
 *             / AXIOM_DATASET when omitted.
 */

import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const dataset = process.argv[2] ?? process.env.HOLOCRON_AXIOM_DATASET ?? process.env.AXIOM_DATASET;

if (!dataset) {
	console.error("usage: pnpm --filter @theholocron/holocron-plugin-axiom validate <dataset>");
	console.error("  or set HOLOCRON_AXIOM_DATASET / AXIOM_DATASET");
	process.exit(2);
}

console.log("Validating @theholocron/holocron-plugin-axiom (READ-ONLY)");
console.log(`  dataset: ${dataset}`);
console.log("");

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: packages/holocron-plugin-axiom/README.md#auth");
		process.exit(2);
	}
	throw err;
}

console.log("[1/3] verifyToken");
const verifyResult = await verifyToken(token);
console.log(verifyResult.ok ? `  ✓ ${verifyResult.subject}` : `  ✗ ${verifyResult.message}`);
console.log("");

const plugin = createPlugin({ cliToken: token, dataset });
const logs = plugin.capabilities.logs();

console.log("[2/3] logs.describe()");
try {
	const desc = await logs.describe();
	console.log(`  ✓ provider: ${desc.provider}; env keys: ${desc.envKeys.join(", ")}`);
} catch (err) {
	console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
}
console.log("");

console.log("[3/3] logs.whoami()");
try {
	const who = await logs.whoami();
	console.log(`  ✓ dataset "${who.dataset}" reachable`);
} catch (err) {
	console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
}

console.log("");
console.log("Done. No writes.");
