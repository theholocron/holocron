#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-neon.
 *
 * READ-ONLY. Tests verifyToken + storage.listBranches — proves auth,
 * endpoint, and response parsing.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-neon validate <projectId>
 */

import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const [projectId] = process.argv.slice(2);

if (!projectId) {
	console.error("usage: pnpm --filter @theholocron/holocron-plugin-neon validate <projectId>");
	console.error("  find projectId at https://console.neon.tech → your project → Settings → General");
	process.exit(2);
}

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: packages/holocron-plugin-neon/README.md#auth");
		process.exit(2);
	}
	throw err;
}

console.log("Validating @theholocron/holocron-plugin-neon (READ-ONLY)");
console.log(`  projectId: ${projectId}`);
console.log("");

console.log("[1/2] verifyToken");
const verifyResult = await verifyToken(token);
console.log(`      ${verifyResult.ok ? "✓" : "✗"} ${JSON.stringify(verifyResult)}`);
if (!verifyResult.ok) {
	const hint = hintFor(verifyResult.message);
	if (hint) console.log(`         hint: ${hint}`);
}
console.log("");

const plugin = createPlugin({ cliToken: token, projectId });
const storage = plugin.capabilities.storage();

console.log("[2/2] storage.listBranches()");
await runStep(async () => {
	const branches = await storage.listBranches();
	console.log(`      ✓ ${branches.length} branch${branches.length === 1 ? "" : "es"}`);
	if (branches.length > 0 && branches.length <= 10) {
		branches.forEach((b) => console.log(`         · ${b.name} (${b.id}) parent=${b.parentId ?? "(root)"}`));
	} else if (branches.length > 10) {
		console.log(`         (${branches.length} total — showing first 10)`);
		branches.slice(0, 10).forEach((b) => console.log(`         · ${b.name} (${b.id})`));
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
		return "token invalid or lacks scope — regenerate at https://console.neon.tech/app/settings/api-keys";
	if (/→ 404/.test(message))
		return "project not found — verify projectId. Vercel-managed Neon orgs need the project provisioned via `vercel install neon` first";
	if (/fetch failed|status: 0|network/i.test(message)) return "network error — check console.neon.tech reachable";
	if (/→ 5\d\d/.test(message)) return "server error — check https://neonstatus.com";
	return null;
}
