#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-doppler
 * against a live Doppler account. Same convention as the other
 * plugins — see `.notes/tool-plugin-create.spec.md` and
 * `packages/holocron-plugin-infisical/scripts/validate.mjs`.
 *
 * READ-ONLY. Never calls write() or bootstrap methods.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-doppler validate \
 *     <project> <config> [secretName]
 */

import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const [project, config, secretName] = process.argv.slice(2);

if (!project || !config) {
	console.error("usage: pnpm --filter @theholocron/holocron-plugin-doppler validate <project> <config> [secretName]");
	process.exit(2);
}

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: packages/holocron-plugin-doppler/README.md#setup");
		process.exit(2);
	}
	throw err;
}

console.log("Validating @theholocron/holocron-plugin-doppler (READ-ONLY)");
console.log(`  project: ${project}`);
console.log(`  config:  ${config}`);
if (secretName) console.log(`  secret:  ${secretName}`);
console.log("");

console.log("[1/4] verifyToken");
const verifyResult = await verifyToken(token);
console.log(`      ${verifyResult.ok ? "✓" : "✗"} ${JSON.stringify(verifyResult)}`);
if (!verifyResult.ok) {
	const hint = hintFor(verifyResult.message);
	if (hint) console.log(`         hint: ${hint}`);
}
console.log("");

const plugin = createPlugin({ cliToken: token, project, config });
const vault = plugin.capabilities.vault();

console.log("[2/4] vault.environments()");
await runStep(async () => {
	const envs = await vault.environments();
	console.log(`      ✓ ${envs.length} config${envs.length === 1 ? "" : "s"}: ${envs.join(", ") || "(none)"}`);
});
console.log("");

console.log(`[3/4] vault.list()  (project: ${project}, config: ${config})`);
await runStep(async () => {
	const keys = await vault.list();
	console.log(`      ✓ ${keys.length} secret${keys.length === 1 ? "" : "s"}`);
	if (keys.length > 0 && keys.length <= 25) keys.forEach((k) => console.log(`         · ${k}`));
	else if (keys.length > 25) {
		console.log(`         (${keys.length} total — showing first 25)`);
		keys.slice(0, 25).forEach((k) => console.log(`         · ${k}`));
	}
});
console.log("");

console.log("[4/4] vault.read()");
if (!secretName) {
	console.log("      · skipped (no secret name provided)");
} else {
	const reference = `doppler://${project}/${config}/${secretName}`;
	console.log(`      · reference: ${reference}`);
	await runStep(async () => {
		const value = await vault.read(reference);
		console.log(`      ✓ read succeeded — value is ${value.length} chars long`);
	});
}
console.log("");
console.log("Done. No writes, no bootstrap operations.");

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
	if (/→ 401/.test(message))
		return "token invalid — regenerate via 'doppler login' or dashboard → Access → Service Tokens";
	if (/→ 403/.test(message)) return "token lacks scope — check the token has access to this project + config";
	if (/→ 404/.test(message))
		return "project / config / secret not found — verify names match the Doppler dashboard exactly";
	if (/fetch failed|status: 0|network/i.test(message))
		return "network error — check https://api.doppler.com/v3 reachable";
	if (/→ 5\d\d/.test(message)) return "server error — retry, check https://status.doppler.com";
	return null;
}
