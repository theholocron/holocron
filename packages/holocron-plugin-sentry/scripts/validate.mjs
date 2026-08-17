#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-sentry.
 *
 * READ-ONLY. Tests verifyToken + observability.whoami + observability.describe
 * — proves auth, org access, and capability wiring.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-sentry validate <org>
 *
 *   org — Sentry organization slug (e.g. "my-org")
 */

import chalk from "chalk";
import { AuthError, createPlugin, resolveToken, verifyToken } from "../src/index.ts";

const ok = (msg) => console.log(`${chalk.green("✓")} ${msg}`);
const fail = (msg) => console.log(`${chalk.red("✗")} ${msg}`);
const step = (msg) => console.log(chalk.cyan(`[${msg}]`));
const hint = (msg) => console.log(chalk.dim(`         hint: ${msg}`));

const [org] = process.argv.slice(2);

if (!org) {
	console.error(chalk.red("usage:") + " pnpm --filter @theholocron/holocron-plugin-sentry validate <org>");
	console.error(chalk.dim("  org — your Sentry organization slug (visible in the Sentry URL)"));
	process.exit(2);
}

console.log(chalk.bold("Validating @theholocron/holocron-plugin-sentry") + chalk.dim(" (READ-ONLY)"));
console.log(chalk.dim(`  org: ${org}`));
console.log("");

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(chalk.red(err.message));
		console.error(chalk.dim("  see: packages/holocron-plugin-sentry/README.md#auth"));
		process.exit(2);
	}
	throw err;
}

step("1/3 verifyToken");
const verifyResult = await verifyToken(token);
if (verifyResult.ok) {
	ok(verifyResult.subject);
} else {
	fail(verifyResult.message);
	const h = hintFor(verifyResult.message);
	if (h) hint(h);
}
console.log("");

const plugin = createPlugin({ cliToken: token, org });
const obs = plugin.capabilities.observability();

step("2/3 observability.whoami()");
await runStep(async () => {
	const result = await obs.whoami();
	ok(`org: ${result.org}`);
});
console.log("");

step("3/3 observability.describe()");
await runStep(async () => {
	const result = await obs.describe();
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
	if (/→ 401|→ 403/.test(message))
		return "token invalid or lacks scope — regenerate at https://sentry.io/settings/account/api/auth-tokens/ with org:read + project:read + project:write";
	if (/→ 404/.test(message))
		return "org not found — verify the slug matches your Sentry organization URL";
	if (/fetch failed|status: 0|network/i.test(message)) return "network error — check sentry.io reachable";
	if (/→ 5\d\d/.test(message)) return "server error — check https://status.sentry.io";
	return null;
}
