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
 * needs adjusting — the `hintFor` helper below points at the most
 * likely cause per error shape.
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
 * Convention: every holocron plugin ships a `scripts/validate.mjs`
 * that smoke-tests its capability methods against a live account.
 * Standardized by the plugin-create scaffold.
 */

import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const [workspace, environment, secretName] = process.argv.slice(2);

if (!workspace || !environment) {
	console.error(
		"usage: pnpm --filter @theholocron/holocron-plugin-infisical validate <workspaceId> <env> [secretName]"
	);
	process.exit(2);
}

// Use the plugin's own auth resolution so the validate script honors
// the same 4-step precedence as the plugin's runtime:
//   --token → HOLOCRON_INFISICAL_TOKEN → INFISICAL_TOKEN → keyring
// (--token isn't available here since this is a bare Node script;
// the other three all work.)
let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: packages/holocron-plugin-infisical/README.md#setup");
		process.exit(2);
	}
	throw err;
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
if (!verifyResult.ok) {
	const hint = hintFor(verifyResult.message);
	if (hint) console.log(`         hint: ${hint}`);
}
console.log("");

// ── 2. environments() ──────────────────────────────────────────────
console.log("[2/4] vault.environments()");
const plugin = createPlugin({ cliToken: token, workspace, environment });
const vault = plugin.capabilities.vault();
await runStep(async () => {
	const envs = await vault.environments();
	console.log(`      ✓ ${envs.length} environment${envs.length === 1 ? "" : "s"}: ${envs.join(", ") || "(none)"}`);
});
console.log("");

// ── 3. list() ──────────────────────────────────────────────────────
console.log(`[3/4] vault.list()  (workspace: ${workspace}, environment: ${environment}, path: /)`);
await runStep(async () => {
	const keys = await vault.list();
	console.log(`      ✓ ${keys.length} secret${keys.length === 1 ? "" : "s"} at root path`);
	if (keys.length > 0 && keys.length <= 25) {
		keys.forEach((k) => console.log(`         · ${k}`));
	} else if (keys.length > 25) {
		console.log(`         (${keys.length} total — showing first 25)`);
		keys.slice(0, 25).forEach((k) => console.log(`         · ${k}`));
	}
});
console.log("");

// ── 4. read() ──────────────────────────────────────────────────────
console.log("[4/4] vault.read()");
if (!secretName) {
	console.log("      · skipped (no secret name provided)");
} else {
	const reference = `infisical://${workspace}/${environment}/${secretName}`;
	console.log(`      · reference: ${reference}`);
	await runStep(async () => {
		const value = await vault.read(reference);
		// Report length only — never print the actual secret value.
		console.log(`      ✓ read succeeded — value is ${value.length} chars long`);
	});
}
console.log("");
console.log(
	"Done. No writes, no bootstrap operations. Nothing in your Infisical account was created, modified, or deleted."
);

// ── helpers ────────────────────────────────────────────────────────

/**
 * Wrap a capability call, print ERROR + hint on failure. Keeps the
 * per-step block small at each call site.
 */
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
 * Add cases here as new failure modes surface.
 */
function hintFor(message) {
	if (/→ 401/.test(message)) {
		return "token invalid — regenerate a Personal Token or Token Auth token (see README §Setup)";
	}
	if (/→ 403/.test(message)) {
		return "token authenticates but lacks scope — grant your machine identity access to the workspace/project in the Infisical dashboard, OR use a Personal API Token";
	}
	if (/→ 404/.test(message)) {
		return "endpoint or resource not found — verify the workspace id from your dashboard URL, and confirm the environment slug + secret name exist";
	}
	if (/fetch failed|status: 0|network/i.test(message)) {
		return "network error — check the base URL (defaults to https://app.infisical.com/api) and connectivity";
	}
	if (/→ 5\d\d/.test(message)) {
		return "server error — Infisical-side. Retry, and if persistent check https://status.infisical.com";
	}
	return null;
}
