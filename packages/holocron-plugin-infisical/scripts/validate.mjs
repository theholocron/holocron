#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-infisical
 * against a live Infisical account. Handy for validating that the
 * plugin's REST endpoints, auth handling, and response parsing all
 * work against the real API — the unit tests only exercise stubbed
 * HTTP responses.
 *
 * READ-ONLY BY DESIGN. Never calls write(), ensureProject, or
 * ensureEnvironment. If any method here shows an ERROR, the plugin
 * needs adjusting.
 *
 * Auth: reads the Infisical token from holocron's keyring — you
 * must have run `pnpm holocron auth set infisical <TOKEN>` first.
 * Use a **Personal API Token** or a **Token Auth** token — Universal
 * Auth's Client Secret doesn't work (needs a login exchange the
 * plugin doesn't yet do — tracked in #100).
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-infisical validate \
 *     <workspaceId> <env> [secretName]
 *
 * Example:
 *   pnpm --filter @theholocron/holocron-plugin-infisical validate \
 *     abc-123 dev TEST_KEY
 *
 * Convention: every holocron plugin ships a \`scripts/validate.mjs\`
 * that smoke-tests its capability methods against a live account.
 * Standardized by the plugin-create scaffold since v2.0.0-alpha.<n>.
 */

import { getToken } from "@theholocron/cli";

import { createPlugin, verifyToken } from "../src/index.ts";

const [workspace, environment, secretName] = process.argv.slice(2);

if (!workspace || !environment) {
	console.error(
		"usage: pnpm exec tsx packages/holocron-plugin-infisical/scripts/validate-plugin-infisical.mjs " +
			"<workspaceId> <env> [secretName]"
	);
	process.exit(2);
}

const token = getToken("infisical");
if (!token) {
	console.error("no Infisical token in keyring. Run: pnpm holocron auth set infisical <TOKEN>");
	process.exit(2);
}

console.log("Validating @theholocron/holocron-plugin-infisical (READ-ONLY)");
console.log(`  workspace:   ${workspace}`);
console.log(`  environment: ${environment}`);
if (secretName) console.log(`  secretName:  ${secretName}`);
console.log("");

// ── 1. verifyToken ─────────────────────────────────────────────────
console.log("[1/4] verifyToken");
const verifyResult = await verifyToken(token);
console.log(`      ${verifyResult.ok ? "✓" : "✗"} ${JSON.stringify(verifyResult)}`);
console.log("");

// ── 2. environments() ──────────────────────────────────────────────
console.log("[2/4] vault.environments()");
const plugin = createPlugin({ cliToken: token, workspace, environment });
const vault = plugin.capabilities.vault();
try {
	const envs = await vault.environments();
	console.log(`      ✓ ${envs.length} environment${envs.length === 1 ? "" : "s"}: ${envs.join(", ") || "(none)"}`);
} catch (err) {
	console.log(`      ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`);
}
console.log("");

// ── 3. list() ──────────────────────────────────────────────────────
console.log(`[3/4] vault.list()  (workspace: ${workspace}, environment: ${environment}, path: /)`);
try {
	const keys = await vault.list();
	console.log(`      ✓ ${keys.length} secret${keys.length === 1 ? "" : "s"} at root path`);
	if (keys.length > 0 && keys.length <= 25) {
		keys.forEach((k) => console.log(`         · ${k}`));
	} else if (keys.length > 25) {
		console.log(`         (${keys.length} total — showing first 25)`);
		keys.slice(0, 25).forEach((k) => console.log(`         · ${k}`));
	}
} catch (err) {
	console.log(`      ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`);
}
console.log("");

// ── 4. read() ──────────────────────────────────────────────────────
console.log("[4/4] vault.read()");
if (!secretName) {
	console.log("      · skipped (no secret name provided)");
} else {
	const reference = `infisical://${workspace}/${environment}/${secretName}`;
	console.log(`      · reference: ${reference}`);
	try {
		const value = await vault.read(reference);
		// Report length only — never print the actual secret value.
		console.log(`      ✓ read succeeded — value is ${value.length} chars long`);
	} catch (err) {
		console.log(`      ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`);
	}
}
console.log("");
console.log(
	"Done. No writes, no bootstrap operations. Nothing in your Infisical account was created, modified, or deleted."
);
