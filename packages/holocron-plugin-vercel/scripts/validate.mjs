#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-vercel.
 *
 * READ-ONLY. Tests deployment.listProjects — proves auth + endpoint.
 *
 * NOTE: this plugin hasn't been auth-modernized yet (no keyring
 * lookup, no verifyToken export). Uses the plugin's own resolveToken
 * which reads `--token` → HOLOCRON_VERCEL_TOKEN → VERCEL_TOKEN.
 * A follow-up will add keyring + verifyToken support.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-vercel validate [projectId]
 */

import { AuthError, createPlugin, resolveToken } from "../src/index.ts";

const [projectId] = process.argv.slice(2);

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: packages/holocron-plugin-vercel/README.md#setup");
		process.exit(2);
	}
	throw err;
}

console.log("Validating @theholocron/holocron-plugin-vercel (READ-ONLY)");
if (projectId) console.log(`  projectId: ${projectId}`);
console.log("");

const plugin = createPlugin({ cliToken: token });
const deployment = plugin.capabilities.deployment();

console.log("[1/2] deployment.listProjects()");
await runStep(async () => {
	const projects = await deployment.listProjects();
	console.log(`      ✓ ${projects.length} project${projects.length === 1 ? "" : "s"}`);
	if (projects.length > 0 && projects.length <= 10) {
		projects.forEach((p) => console.log(`         · ${p.name} (${p.id})`));
	} else if (projects.length > 10) {
		console.log(`         (${projects.length} total — showing first 10)`);
		projects.slice(0, 10).forEach((p) => console.log(`         · ${p.name} (${p.id})`));
	}
});
console.log("");

console.log("[2/2] deployment.listEnvVars(projectId, 'production')");
if (!projectId) {
	console.log("      · skipped (no projectId provided)");
} else {
	await runStep(async () => {
		const names = await deployment.listEnvVars(projectId, "production");
		console.log(`      ✓ ${names.length} env var${names.length === 1 ? "" : "s"} in production`);
	});
}
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
		return "token invalid or lacks scope — regenerate at https://vercel.com/account/tokens with 'Full Account' scope";
	if (/→ 404/.test(message))
		return "project not found — verify the projectId from https://vercel.com/<team>/<project>/settings/general";
	if (/fetch failed|status: 0|network/i.test(message)) return "network error — check api.vercel.com reachable";
	if (/→ 5\d\d/.test(message)) return "server error — check https://www.vercel-status.com";
	return null;
}
