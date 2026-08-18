#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-posthog.
 *
 * READ-ONLY. Tests verifyToken + analytics.whoami + analytics.describe
 * — proves auth, org access, and capability wiring.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-posthog validate
 *
 * EU cloud:
 *   POSTHOG_HOST=https://eu.posthog.com pnpm --filter @theholocron/holocron-plugin-posthog validate
 */

import chalk from "chalk";

import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const ok = (msg) => console.log(`${chalk.green("✓")} ${msg}`);
const fail = (msg) => console.log(`${chalk.red("✗")} ${msg}`);
const step = (msg) => console.log(chalk.cyan(`[${msg}]`));
const hint = (msg) => console.log(chalk.dim(`         hint: ${msg}`));

const host = process.env["POSTHOG_HOST"];

console.log(chalk.bold("Validating @theholocron/holocron-plugin-posthog") + chalk.dim(" (READ-ONLY)"));
if (host) console.log(chalk.dim(`  host: ${host}`));
console.log("");

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(chalk.red(err.message));
		console.error(chalk.dim("  see: packages/holocron-plugin-posthog/README.md#auth"));
		process.exit(2);
	}
	throw err;
}

step("1/3 verifyToken");
const verifyResult = await verifyToken(token, { host });
if (verifyResult.ok) {
	ok(verifyResult.subject);
} else {
	fail(verifyResult.message);
	const h = hintFor(verifyResult.message);
	if (h) hint(h);
}
console.log("");

const plugin = createPlugin({ cliToken: token, host });
const an = plugin.capabilities.analytics();

step("2/3 analytics.whoami()");
await runStep(async () => {
	const result = await an.whoami();
	ok(`org: ${result.org}`);
});
console.log("");

step("3/3 analytics.describe()");
await runStep(async () => {
	const result = await an.describe();
	ok(`provider: ${result.provider}`);
	console.log(chalk.dim(`   envKeys: ${result.envKeys.join(", ")}`));
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
	if (/→ 401|→ 403|not_authenticated/i.test(message))
		return "key invalid — generate a personal API key (phx_*) at https://app.posthog.com/settings/user/api-keys";
	if (/fetch failed|network/i.test(message)) return "network error — check app.posthog.com reachable (or set POSTHOG_HOST for EU cloud)";
	if (/→ 5\d\d/.test(message)) return "server error — check https://status.posthog.com";
	return null;
}
