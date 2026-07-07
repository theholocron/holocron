#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-postman.
 *
 * READ-ONLY. Tests verifyToken + tooling.doctor — proves auth,
 * endpoint, and vendor reachability.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-postman validate <workspaceId>
 */

import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const [workspaceId] = process.argv.slice(2);

if (!workspaceId) {
	console.error("usage: pnpm --filter @theholocron/holocron-plugin-postman validate <workspaceId>");
	console.error("  find workspaceId at https://postman.co → your workspace → Settings → General → Info");
	process.exit(2);
}

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: packages/holocron-plugin-postman/README.md#auth");
		process.exit(2);
	}
	throw err;
}

console.log("Validating @theholocron/holocron-plugin-postman (READ-ONLY)");
console.log(`  workspaceId: ${workspaceId}`);
console.log("");

console.log("[1/2] verifyToken");
const verifyResult = await verifyToken(token);
console.log(`      ${verifyResult.ok ? "✓" : "✗"} ${JSON.stringify(verifyResult)}`);
if (!verifyResult.ok) {
	const hint = hintFor(verifyResult.message);
	if (hint) console.log(`         hint: ${hint}`);
}
console.log("");

const plugin = createPlugin({ cliToken: token, workspaceId });
const toolings = plugin.capabilities.tooling;
// `tooling` is many-cardinality — resolves to an array. Postman may be
// the only one loaded here since we constructed the plugin directly.
const tools =
	typeof toolings === "function"
		? [toolings()]
		: Array.isArray(toolings)
			? toolings.map((t) => (typeof t === "function" ? t() : t))
			: [];

console.log(`[2/2] tooling.doctor()  (${tools.length} tooling provider${tools.length === 1 ? "" : "s"})`);
for (const tool of tools) {
	await runStep(async () => {
		const report = await tool.doctor();
		console.log(`      ${report.ok ? "✓" : "✗"} ${tool.providerName ?? "postman"}: ${report.message}`);
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
		return "API key invalid or lacks scope — regenerate at https://postman.co/settings/me/api-keys";
	if (/→ 404/.test(message)) return "endpoint or workspace not found";
	if (/fetch failed|status: 0|network/i.test(message)) return "network error — check api.getpostman.com reachable";
	if (/→ 5\d\d/.test(message)) return "server error — check https://status.postman.com";
	return null;
}
