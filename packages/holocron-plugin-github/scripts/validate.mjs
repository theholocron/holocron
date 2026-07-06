#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-github.
 *
 * READ-ONLY. Exercises a couple of representative capability methods
 * across the multi-capability plugin (source / ci / issues) — enough
 * to prove auth + endpoints + response parsing work.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-github validate <owner/repo>
 */

import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const [repo] = process.argv.slice(2);

if (!repo || !repo.includes("/")) {
	console.error("usage: pnpm --filter @theholocron/holocron-plugin-github validate <owner/repo>");
	process.exit(2);
}

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(err.message);
		console.error("  see: packages/holocron-plugin-github/README.md#setup");
		process.exit(2);
	}
	throw err;
}

console.log("Validating @theholocron/holocron-plugin-github (READ-ONLY)");
console.log(`  repo: ${repo}`);
console.log("");

console.log("[1/4] verifyToken");
const verifyResult = await verifyToken(token);
console.log(`      ${verifyResult.ok ? "✓" : "✗"} ${JSON.stringify(verifyResult)}`);
if (!verifyResult.ok) {
	const hint = hintFor(verifyResult.message);
	if (hint) console.log(`         hint: ${hint}`);
}
console.log("");

const plugin = createPlugin({ cliToken: token, repo });

console.log("[2/4] source.whoami()");
const source = plugin.capabilities.source();
await runStep(async () => {
	const me = await source.whoami();
	console.log(`      ✓ authed as ${me.login}`);
});
console.log("");

console.log(`[3/4] ci.listRuns({ limit: 3 })  (repo: ${repo})`);
const ci = plugin.capabilities.ci();
await runStep(async () => {
	const runs = await ci.listRuns({ limit: 3 });
	console.log(`      ✓ ${runs.length} recent run${runs.length === 1 ? "" : "s"}`);
	runs.forEach((r) => console.log(`         · ${r.workflowName} (${r.status}) — ${r.branch}`));
});
console.log("");

console.log("[4/4] issues.search({ openOnly: true, limit: 3 })");
const issues = plugin.capabilities.issues();
await runStep(async () => {
	const results = await issues.search({ openOnly: true, limit: 3 });
	console.log(`      ✓ ${results.length} open issue${results.length === 1 ? "" : "s"}`);
	results.forEach((i) => console.log(`         · ${i.key} ${i.summary}`));
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
	if (/→ 401/.test(message)) return "token invalid — regenerate PAT at https://github.com/settings/tokens";
	if (/→ 403/.test(message)) return "token lacks scope — need repo (+ admin:repo_hook for org-level ops)";
	if (/→ 404/.test(message)) return "repo not found or no access — verify owner/name and token permissions";
	if (/fetch failed|status: 0|network/i.test(message)) return "network error — check api.github.com reachable";
	if (/→ 5\d\d/.test(message)) return "server error — check https://www.githubstatus.com";
	return null;
}
