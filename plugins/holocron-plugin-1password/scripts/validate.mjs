#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-1password.
 *
 * Different shape from the REST plugins because 1P shells out to
 * the `op` CLI. Validates that `op` is installed + signed in + can
 * list items in the configured vault.
 *
 * READ-ONLY. Never calls write().
 *
 * Auth: 1P doesn't use a bearer in the keyring; it uses `op`'s own
 * auth (desktop biometric on laptop, OP_SERVICE_ACCOUNT_TOKEN in CI).
 * The `verifyToken` export here ignores its token arg — it just
 * runs `op whoami`.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-1password validate <vaultName>
 */

import { createPlugin, verifyToken } from "../src/index.ts";

const [vaultName] = process.argv.slice(2);

if (!vaultName) {
	console.error("usage: pnpm --filter @theholocron/holocron-plugin-1password validate <vaultName>");
	console.error("  the vaultName is the 1P vault items live in (e.g., 'holocron')");
	process.exit(2);
}

console.log("Validating @theholocron/holocron-plugin-1password (READ-ONLY)");
console.log(`  vault: ${vaultName}`);
console.log("");

console.log("[1/2] verifyToken  (runs `op whoami`)");
// Token arg is ignored — see verify-token.ts
const verifyResult = await verifyToken("");
console.log(`      ${verifyResult.ok ? "✓" : "✗"} ${JSON.stringify(verifyResult)}`);
if (!verifyResult.ok) {
	const hint = hintFor(verifyResult.message);
	if (hint) console.log(`         hint: ${hint}`);
	console.log("");
	console.log("`op` is not signed in — skipping further steps.");
	process.exit(1);
}
console.log("");

console.log(`[2/2] vault.list()  (vault: ${vaultName})`);
try {
	const plugin = createPlugin({ vault: vaultName });
	const vault = plugin.capabilities.vault();
	const keys = await vault.list();
	console.log(`      ✓ ${keys.length} item${keys.length === 1 ? "" : "s"} in vault`);
	if (keys.length > 0 && keys.length <= 25) keys.forEach((k) => console.log(`         · ${k}`));
	else if (keys.length > 25) {
		console.log(`         (${keys.length} total — showing first 25)`);
		keys.slice(0, 25).forEach((k) => console.log(`         · ${k}`));
	}
} catch (err) {
	const message = err instanceof Error ? err.message : String(err);
	console.log(`      ✗ ERROR: ${message}`);
	const hint = hintFor(message);
	if (hint) console.log(`         hint: ${hint}`);
}
console.log("");
console.log("Done. No writes.");

function hintFor(message) {
	if (/not found on PATH/i.test(message)) return "install: brew install 1password-cli";
	if (/not currently signed in|whoami failed/i.test(message))
		return "sign in: `op signin` on your laptop, OR set OP_SERVICE_ACCOUNT_TOKEN in CI";
	if (/vault.*not found|no such vault/i.test(message)) return "vault name mismatch — check `op vault list`";
	if (/failed|exit \d/i.test(message)) return "op CLI exited non-zero — inspect stderr for the underlying reason";
	return null;
}
