#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-cloudflare.
 *
 * READ-ONLY. Tests verifyToken + dns.listRecords — proves auth,
 * zone resolution, and DNS record parsing.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-cloudflare validate <domain>
 *
 *   domain — the apex zone or subdomain to look up (e.g. "example.com")
 */

import chalk from "chalk";

import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const ok = (msg) => console.log(`${chalk.green("✓")} ${msg}`);
const fail = (msg) => console.log(`${chalk.red("✗")} ${msg}`);
const step = (msg) => console.log(chalk.cyan(`[${msg}]`));
const hint = (msg) => console.log(chalk.dim(`         hint: ${msg}`));

const [domain] = process.argv.slice(2);

if (!domain) {
	console.error(chalk.red("usage:") + " pnpm --filter @theholocron/holocron-plugin-cloudflare validate <domain>");
	console.error(chalk.dim("  domain — the apex zone or subdomain to look up (e.g. example.com)"));
	process.exit(2);
}

console.log(chalk.bold("Validating @theholocron/holocron-plugin-cloudflare") + chalk.dim(" (READ-ONLY)"));
console.log(chalk.dim(`  domain: ${domain}`));
console.log("");

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(chalk.red(err.message));
		console.error(chalk.dim("  see: packages/holocron-plugin-cloudflare/README.md#auth"));
		process.exit(2);
	}
	throw err;
}

step("1/2 verifyToken");
const verifyResult = await verifyToken(token);
if (verifyResult.ok) {
	ok(verifyResult.subject);
} else {
	fail(verifyResult.message);
	const h = hintFor(verifyResult.message);
	if (h) hint(h);
}
console.log("");

const plugin = createPlugin({ cliToken: token });
const dns = plugin.capabilities.dns();

step(`2/2 dns.listRecords("${domain}")`);
await runStep(async () => {
	const records = await dns.listRecords(domain);
	ok(`${records.length} record${records.length === 1 ? "" : "s"}`);
	if (records.length > 0 && records.length <= 10) {
		records.forEach((r) => console.log(chalk.dim(`   ${r.type.padEnd(5)} ${r.name}  →  ${r.content}`)));
	} else if (records.length > 10) {
		console.log(chalk.dim(`   (${records.length} total — showing first 10)`));
		records.slice(0, 10).forEach((r) => console.log(chalk.dim(`   ${r.type.padEnd(5)} ${r.name}  →  ${r.content}`)));
	}
});

console.log("");
console.log(chalk.dim("Done. No writes."));

async function runStep(body) {
	try {
		await body();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		fail(message);
		const h = hintFor(message);
		if (h) hint(h);
	}
}

function hintFor(message) {
	if (/→ 401|→ 403/.test(message))
		return "token invalid or lacks scope — regenerate at https://dash.cloudflare.com/profile/api-tokens with Zone:Read + DNS:Edit";
	if (/No Cloudflare zone found/i.test(message))
		return "zone not found — verify the domain is in your Cloudflare account";
	if (/fetch failed|status: 0|network/i.test(message)) return "network error — check api.cloudflare.com reachable";
	if (/→ 5\d\d/.test(message)) return "server error — check https://www.cloudflarestatus.com";
	return null;
}
